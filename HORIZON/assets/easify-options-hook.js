/**
 * easify-options-hook.js
 * 
 * Hooks into Easify Product Options and bridges it with HORIZON minimum pricing.
 * 
 * Easify communicates via:
 * - Custom events on the form/document
 * - Data attributes on inputs
 * - MutationObserver for price/measurement changes
 */

// @ts-nocheck

const EasifyOptionsHook = {
  config: {
    pollInterval: 250,
    minAreaM2: 1.0,
    debounceMs: 50,  // Reduced from 300ms for faster threshold crossing detection
  },

  minPriceTable: {
    '_1_2': { standard: 23.22, special: 24.67 },
    '_2_2': { standard: 24.58, special: 25.58 },
    '_1_1': { standard: 33.60, special: 34.68 },
    '_2_1': { standard: 37.15, special: 37.91 }
  },

  state: {
    currentWidth: 0,
    currentHeight: 0,
    currentArea: 0,
    currentPrice: 0,
    variantId: null,
    _minimumShown: false,
    currentMPC: null,
    currentMinPrice: null,
    _lastLoggedMinPrice: null,  // Track last logged price to reduce console spam
    cachedColorIsSpecial: false,  // Track if special color was selected
    cachedColorValue: null,  // Store the color input value
    currentVariantName: null,  // Store the current product variant name
  },

  init() {
    console.log('[EasifyOptionsHook] Initializing...');
    this.setupMeasurementWatcher();
    this.setupPriceObserver();
    this.setupFormSubmissionHook();
    this.setupPriceLockMonitor();
    this.setupMPCWatcher();
    
    // Cache color selection on page load
    setTimeout(() => this.cacheColorSelection(), 500);
  },

  /**
   * Monitor and lock price overrides to prevent Easify from changing them
   * Uses requestAnimationFrame for sub-frame-time reapplication
   */
  setupPriceLockMonitor() {
    let rafId = null;
    
    const continuousOverride = () => {
      // If minimum pricing is active, keep reapplying the override on every frame
      if (this.state.currentArea > 0 && this.state.currentArea < this.config.minAreaM2 && this.state.currentMinPrice) {
        // Forcefully override both Easify and theme prices
        const formatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const priceText = formatter.format(this.state.currentMinPrice);
        
        // Override Easify's additional price
        document.querySelectorAll('.tpo_total-additional-price').forEach(el => {
          if (el.textContent.trim() !== priceText) {
            el.textContent = priceText;
          }
        });
        
        // Override theme price elements
        document.querySelectorAll('.price').forEach(el => {
          if (el.textContent.trim() !== priceText) {
            el.textContent = priceText;
          }
        });
        
        // Ensure minimum price warning is visible
        this.displayMinimumPriceWarning();
      }
      
      // Schedule next frame
      rafId = requestAnimationFrame(continuousOverride);
    };
    
    // Start continuous override when needed (triggered by measurement changes)
    // This will be controlled by triggerMinimumPricingLogic
    this._startContinuousOverride = () => {
      if (rafId) cancelAnimationFrame(rafId);
      continuousOverride();
    };
    
    this._stopContinuousOverride = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    };
  },

  /**
   * Cache current color selection state
   */
  cacheColorSelection() {
    const colorInput = Array.from(document.querySelectorAll('input[type="radio"]:checked')).find(el => {
      const name = el.name || '';
      return name.toLowerCase().includes('farbwahl');
    });
    if (colorInput) {
      this.state.cachedColorIsSpecial = colorInput.value && (colorInput.value.toLowerCase().includes('special') || colorInput.value.toLowerCase().includes('sonder') || colorInput.value.toLowerCase().includes('(s)'));
      this.state.cachedColorValue = colorInput.value;
    }
  },

  /**
   * Restore color selection from cache
   * Finds VISIBLE color inputs, extracts the current field identifier, then restores the cached color
   * Only works with currently visible input group (Easify keeps all variants in DOM but hides them)
   */
  restoreColorSelection() {
    if (!this.state.cachedColorValue) return;

    const attemptRestore = (attempt = 0) => {
      // Find ALL visible color radio buttons
      const visibleColorInputs = Array.from(document.querySelectorAll('input[type="radio"]')).filter(el => {
        const name = el.name || '';
        return name.toLowerCase().includes('farbwahl') && el.offsetParent !== null && el.clientHeight > 0;
      });

      if (visibleColorInputs.length === 0) {
        if (attempt < 5) {
          setTimeout(() => attemptRestore(attempt + 1), 100);
        }
        return;
      }

      // All visible inputs should share the same name pattern
      // Extract the current field name from the first visible input
      const currentFieldName = visibleColorInputs[0].name;
      
      // Find target input: same field name (same variant) AND matching cached color value
      const targetInput = visibleColorInputs.find(inp => 
        inp.name === currentFieldName && inp.value === this.state.cachedColorValue
      );
      
      if (targetInput) {
        targetInput.checked = true;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetInput.dispatchEvent(new Event('click', { bubbles: true }));
        console.log(`[EasifyOptionsHook] ✓ Color restored from cache: ${targetInput.value}`);
      } else {
        // Color not available in new variant
        console.log(`[EasifyOptionsHook] Color "${this.state.cachedColorValue}" not available in new variant, keeping current selection`);
      }
    };

    setTimeout(() => attemptRestore(0), 150);
  },

  /**
   * Watch for Material-Profile-Color (MPC) changes
   * Polls periodically to detect radio button state changes that might not trigger events
   */
  setupMPCWatcher() {
    let lastMPC = null;
    
    setInterval(() => {
      const currentMPC = this.detectMPC();
      const currentMPCStr = currentMPC ? JSON.stringify(currentMPC) : null;
      const lastMPCStr = lastMPC ? JSON.stringify(lastMPC) : null;
      
      if (currentMPCStr !== lastMPCStr) {
        if (currentMPC) {
          console.log(`[EasifyOptionsHook] MPC changed: ${currentMPC.code} (${currentMPC.isSpecial ? 'special' : 'standard'}), updating pricing...`);
          lastMPC = currentMPC;
          
          // Check if Easify cleared the dimensions (common when changing MPC)
          // Find dimension inputs by looking for BREITE/HÖHE, then filter to visible ones
          const allDimensionInputs = Array.from(document.querySelectorAll('input[name*="Abmessung"]'));
          let widthInput = null, heightInput = null;
          
          allDimensionInputs.forEach(inp => {
            const isVisible = inp.offsetParent !== null && inp.clientHeight > 0;
            if (!isVisible) return;
            const nameUpper = (inp.name || '').toUpperCase();
            if (nameUpper.includes('BREITE')) widthInput = inp;
            if (nameUpper.includes('HÖHE') || nameUpper.includes('HOEHE') || nameUpper.includes('HEIGHT')) heightInput = inp;
          });
          
          // Extract variant name from the input if available
          if (widthInput) {
            const variantMatch = (widthInput.name || '').match(/Abmessung \(mm\) (.+?)-(Breite|Höhe)/i);
            if (variantMatch) {
              this.state.currentVariantName = variantMatch[1].trim();
            }
          }
          
          const currentWidth = parseFloat(widthInput?.value) || 0;
          const currentHeight = parseFloat(heightInput?.value) || 0;
          
          if ((currentWidth === 0 || currentHeight === 0) && (this.state.currentWidth > 0 || this.state.currentHeight > 0)) {
            console.log(`[EasifyOptionsHook] ✓ Dimensions were cleared by Easify, restoring from cache: ${this.state.currentWidth}mm × ${this.state.currentHeight}mm`);
            
            // Use the stored variant name to target the right inputs
            const variantName = this.state.currentVariantName;
            console.log(`[EasifyOptionsHook] Dimension restore attempt - Stored variant: "${variantName}", Cached values: W=${this.state.currentWidth}, H=${this.state.currentHeight}`);
            
            // Poll for inputs with this specific variant name
            let pollAttempts = 0;
            const pollMax = 50;
            
            const pollForInputsAndRestore = () => {
              pollAttempts++;
              
              // Re-query the dimension inputs on each poll (they might be re-rendered)
              const allDimensionInputs = Array.from(document.querySelectorAll('input[name*="Abmessung"]'));
              
              // Find inputs for the stored variant, ignoring visibility (they're in hidden DOM)
              const variantPattern = variantName ? 
                new RegExp(`Abmessung \\(mm\\) ${variantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(Breite|Höhe)`, 'i') : 
                null;
              
              let freshW = null, freshH = null;
              
              if (variantPattern) {
                allDimensionInputs.forEach(inp => {
                  if (!variantPattern.test(inp.name || '')) return;
                  const nameUpper = (inp.name || '').toUpperCase();
                  if (nameUpper.includes('BREITE')) freshW = inp;
                  if (nameUpper.includes('HÖHE') || nameUpper.includes('HOEHE') || nameUpper.includes('HEIGHT')) freshH = inp;
                });
              }
              
              console.log(`[POLL #${pollAttempts}] Targeting variant "${variantName}" - Found width: ${!!freshW}, Found height: ${!!freshH}`);
              
              if (freshW && freshH) {
                // Found the right inputs - restore them regardless of visibility
                console.log(`[EasifyOptionsHook] Found dimension inputs for variant. Setting W=${this.state.currentWidth}, H=${this.state.currentHeight}`);
                // Set values and trigger React's onChange by simulating native setter
                const setInputValue = (input, value) => {
                  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                  descriptor.set.call(input, value);
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                };
                
                setInputValue(freshW, this.state.currentWidth);
                setInputValue(freshH, this.state.currentHeight);
                
                // Trigger focus/blur cycle to force React re-render
                freshW.focus();
                freshH.focus();
                setTimeout(() => {
                  freshW.blur();
                  freshH.blur();
                }, 50);
                
                // Watch for input mutations to sync values to newly rendered elements
                const container = document.querySelector('form') || document.querySelector('.easify-options');
                if (container && pollAttempts < 10) {
                  let watchAttempts = 0;
                  const observer = new MutationObserver(() => {
                    watchAttempts++;
                    if (watchAttempts <= 5) {
                      const fresh = Array.from(document.querySelectorAll('input[name*="Abmessung"]'))
                        .filter(inp => inp.name && new RegExp(`Abmessung.*${variantName}.*-.*`, 'i').test(inp.name));
                      if (fresh.length >= 2) {
                        const w = fresh.find(inp => /BREITE/i.test(inp.name));
                        const h = fresh.find(inp => /HÖHE|HOEHE|HEIGHT/i.test(inp.name));
                        if (w && h && w.value !== this.state.currentWidth.toString()) {
                          console.log(`[EasifyOptionsHook] Re-syncing via MutationObserver on attempt ${watchAttempts}`);
                          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                          descriptor.set.call(w, this.state.currentWidth);
                          descriptor.set.call(h, this.state.currentHeight);
                          w.dispatchEvent(new Event('input', { bubbles: true }));
                          h.dispatchEvent(new Event('input', { bubbles: true }));
                          w.dispatchEvent(new Event('change', { bubbles: true }));
                          h.dispatchEvent(new Event('change', { bubbles: true }));
                          observer.disconnect();
                        }
                      }
                    } else {
                      observer.disconnect();
                    }
                  });
                  observer.observe(container, { childList: true, subtree: true, attributes: true });
                  setTimeout(() => observer.disconnect(), 2000);
                }
              } else if (pollAttempts < pollMax) {
                // Keep polling - variant might not be fully rendered yet
                setTimeout(pollForInputsAndRestore.bind(this), 100);
              } else {
                console.log(`[POLL] TIMEOUT - could not find inputs for variant "${currentVariantName}"`);
              }
            };
            
            pollForInputsAndRestore.call(this);
          }

          // Try to restore color selection if available in new variant
          this.restoreColorSelection();

          // Cache the new color selection for next material change (after restore completes)
          setTimeout(() => this.cacheColorSelection(), 300);
          
          // Trigger pricing update immediately when MPC changes
          if (this._debounceTimer) clearTimeout(this._debounceTimer);
          this.triggerMinimumPricingLogic();
          
          // If we're below minimum, restart continuous override with new price
          if (this.state.currentArea > 0 && this.state.currentArea < this.config.minAreaM2) {
            console.log(`[EasifyOptionsHook] MPC change below minimum - restarting continuous override with new price €${this.state.currentMinPrice.toFixed(2)}`);
            // Restart the continuous override to use the new price
            this._startContinuousOverride();
          }
        }
      }
    }, 100);  // Check every 100ms for faster detection
  },

  /**
   * Watch for measurement input changes
   * Detects Easify measurement inputs like: properties[Abmessung (mm) Alu Mini Standard-Breite]
   * Focuses on the currently selected variant only.
   */
  setupMeasurementWatcher() {
    // Replace interval polling with MutationObserver + input listeners for efficiency.
    let previousState = { width: 0, height: 0, variant: null };
    let observeTarget = document.querySelector('.product-details') || document.querySelector('.product-information') || document.body;

    const readVariantGroups = () => {
      const allInputs = observeTarget.querySelectorAll('input[name*="Abmessung"]');
      const variantGroups = {};

      allInputs.forEach((input) => {
        const value = parseFloat(input.value) || 0;
        const name = input.name || '';
        const variantMatch = name.match(/Abmessung \(mm\) (.+?)-(Breite|Höhe)/i);
        if (!variantMatch) return;
        const variant = variantMatch[1].trim();
        const dimension = variantMatch[2];
        if (!variantGroups[variant]) variantGroups[variant] = { width: 0, height: 0 };
        if (dimension.includes('Breite') || dimension.includes('Width')) variantGroups[variant].width = value;
        if (dimension.includes('Höhe') || dimension.includes('hoehe') || dimension.includes('Height')) variantGroups[variant].height = value;
      });

      return variantGroups;
    };

    const selectActiveVariant = (groups) => {
      // Try to detect selected variant from the DOM
      const sel = document.querySelector('select[name="id"], input[type="radio"][name="id"]:checked, [data-selected-variant], [data-variant-id]');
      let selected = null;
      if (sel) {
        if (sel.tagName === 'SELECT' || sel.tagName === 'INPUT') {
          // Try to map select value/option text to group name
          const val = sel.value || sel.dataset.variantId || sel.dataset.selectedVariant;
          // Best-effort: find group whose name contains the option text
          const optionText = (sel.selectedOptions && sel.selectedOptions[0] && sel.selectedOptions[0].text) || '';
          for (const g of Object.keys(groups)) {
            if (optionText && optionText.includes(g)) { selected = g; break; }
            if (String(val) && g.includes(String(val))) { selected = g; break; }
          }
        } else if (sel.dataset && (sel.dataset.variantId || sel.dataset.selectedVariant)) {
          const val = sel.dataset.variantId || sel.dataset.selectedVariant;
          for (const g of Object.keys(groups)) { if (g.includes(String(val))) { selected = g; break; } }
        }
      }

      // Fallback: pick first group that has non-zero width & height
      if (!selected) {
        for (const [variant, m] of Object.entries(groups)) {
          if (m.width > 0 && m.height > 0) { selected = variant; break; }
        }
      }

      return selected;
    };

    const handleGroups = (groups) => {
      const selected = selectActiveVariant(groups);
      let currentState = { width: 0, height: 0, variant: null };
      if (selected && groups[selected]) {
        currentState.width = groups[selected].width;
        currentState.height = groups[selected].height;
        currentState.variant = selected;
      } else {
        // fallback to any non-zero group
        for (const [v, m] of Object.entries(groups)) {
          if (m.width > 0 && m.height > 0) { currentState = { width: m.width, height: m.height, variant: v }; break; }
        }
      }

      if (currentState.width !== previousState.width || currentState.height !== previousState.height || currentState.variant !== previousState.variant) {
        if (currentState.width > 0 && currentState.height > 0) {
          this.state.currentWidth = currentState.width;
          this.state.currentHeight = currentState.height;
          const newArea = (currentState.width * currentState.height) / 1e6;
          console.log(`[EasifyOptionsHook] ✓ Measurements changed: ${currentState.width}mm × ${currentState.height}mm = ${newArea.toFixed(3)} m² (variant: ${currentState.variant})`);
          
          // Check if we crossed the 1.0 m² threshold - if so, trigger immediately without debounce
          const crossedThreshold = (this.state.currentArea < this.config.minAreaM2 && newArea >= this.config.minAreaM2) ||
                                   (this.state.currentArea >= this.config.minAreaM2 && newArea < this.config.minAreaM2);
          
          this.state.currentArea = newArea;
          
          if (crossedThreshold) {
            // Immediate update when crossing threshold
            console.log('[EasifyOptionsHook] Crossed 1.0 m² threshold - updating immediately');
            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this.triggerMinimumPricingLogic();
          } else {
            // Debounce for normal measurement changes
            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => this.triggerMinimumPricingLogic(), this.config.debounceMs);
          }
        } else if ((previousState.width > 0 || previousState.height > 0) && (currentState.width === 0 || currentState.height === 0)) {
          console.log(`[EasifyOptionsHook] Measurements cleared (width=${currentState.width}, height=${currentState.height})`);
          if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
          this.state._minimumShown = false;
        }
        previousState = { ...currentState };
      }
    };

    // Observe DOM changes and input events inside the product details area
    const mo = new MutationObserver((mutations) => {
      // Quick path: if mutation affects inputs or their values, re-read groups
      let shouldRead = false;
      let mpcChanged = false;
      
      for (const m of mutations) {
        // Check for measurement input changes
        if (m.type === 'attributes' && m.target && m.target.tagName === 'INPUT') { 
          const inputName = m.target.name || '';
          if (inputName.includes('Abmessung')) {
            shouldRead = true;
          }
          // Check for radio button state changes (MPC selectors)
          if (m.attributeName === 'checked' && m.target.type === 'radio') {
            const name = inputName.toLowerCase();
            if (name.includes('materialauswahl') || name.includes('profilhoehe') || 
                name.includes('profilhöhe') || name.includes('farbwahl')) {
              mpcChanged = true;
            }
          }
          break;
        }
        if (m.type === 'childList') {
          // new/removed inputs
          if (Array.from(m.addedNodes).some(n => n.nodeType === 1 && n.matches && n.matches('input')) ||
              Array.from(m.removedNodes).some(n => n.nodeType === 1 && n.matches && n.matches('input'))) { shouldRead = true; break; }
        }
      }
      
      if (shouldRead) {
        const groups = readVariantGroups();
        handleGroups(groups);
      }
      if (mpcChanged) {
        console.log('[EasifyOptionsHook] MPC changed (via MutationObserver), updating pricing...');
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this.triggerMinimumPricingLogic();
      }
    });

    try { mo.observe(observeTarget, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'checked'] }); } catch (e) { /* ignore */ }

    // Capture input events for immediate responsiveness
    observeTarget.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t && t.matches && t.matches('input[name*="Abmessung"]')) {
        const groups = readVariantGroups();
        handleGroups(groups);
      }
    }, true);
    
    // Listen for radio button changes (material, profile, color) to update MPC detection
    observeTarget.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t && t.type === 'radio' && t.name) {
        const name = t.name.toLowerCase();
        // Check if it's a material, profile, or color selector
        if (name.includes('materialauswahl') || 
            name.includes('profilhoehe') || 
            name.includes('profilhöhe') ||
            name.includes('farbwahl')) {
          console.log(`[EasifyOptionsHook] MPC selector changed (${t.name}), updating pricing...`);
          // Cache color selection if user selected a color
          if (name.includes('farbwahl')) {
            this.cacheColorSelection();
          }
          // Re-trigger pricing logic immediately (no debounce for MPC changes)
          if (this._debounceTimer) clearTimeout(this._debounceTimer);
          this.triggerMinimumPricingLogic();
        }
      }
    }, true);

    // Initial read
    try { handleGroups(readVariantGroups()); } catch (e) { /* ignore */ }
  },

  /**
   * Watch for price changes in the DOM
   */
  setupPriceObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          const priceEl = document.querySelector('.price, [data-testid="price"], .product__price');
          if (priceEl) {
            const priceText = priceEl.textContent;
            const priceMatch = priceText.match(/[\d.,\s]+/);
            if (priceMatch) {
              const cleanPrice = priceMatch[0].replace(/[.,\s]/g, (m) => (m === '.' || m === ',' ? '.' : ''));
              const price = parseFloat(cleanPrice);

              if (price > 0 && price !== this.state.currentPrice) {
                this.state.currentPrice = price;
                console.log(`[EasifyOptionsHook] Price updated: ${price}`);
                this.triggerMinimumPricingLogic();
              }
            }
          }
        }
      });
      // Re-apply minimum price override if area is below threshold and price was changed by Easify
      if (this.state.currentArea > 0 && this.state.currentArea < this.config.minAreaM2 && this.state.currentMinPrice) {
        setTimeout(() => this.overridePriceDisplay(), 50);
      }
    });

    const priceContainer = document.querySelector('.product-details, .product-information');
    if (priceContainer) {
      observer.observe(priceContainer, {
        subtree: true,
        characterData: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-price', 'data-testid'],
      });
      console.log('[EasifyOptionsHook] Price observer started');
    }
  },

  /**
   * Hook into form submission to apply minimum pricing to cart
   */
  setupFormSubmissionHook() {
    const form = document.querySelector('form[action*="cart"]');
    if (!form) {
      console.warn('[EasifyOptionsHook] Cart form not found');
      return;
    }

    form.addEventListener('submit', (e) => {
      console.log('[EasifyOptionsHook] Form submitted');
      this.applyMinimumPricingToCart();
    });

    console.log('[EasifyOptionsHook] Form submission hook installed');
  },

  /**
   * Detect Material-Profile-Color (MPC) combination from form
   */
  detectMPC() {
    const material = Array.from(document.querySelectorAll('input[type="radio"]:checked')).find(el =>
      el.name && el.name.toLowerCase().includes('materialauswahl')
    );
    const profile = Array.from(document.querySelectorAll('input[type="radio"]:checked')).find(el =>
      el.name && (el.name.toLowerCase().includes('profilhoehe') || el.name.toLowerCase().includes('profilhöhe'))
    );

    if (!material || !profile) return null;

    const mat = (material.value || '').toLowerCase();
    const prof = (profile.value || '').toLowerCase();

    let code = null;
    if (mat.includes('alu') || mat.includes('aluminium')) {
      code = prof.includes('mini') ? '_1_1' : '_2_1';
    } else if (mat.includes('pvc')) {
      code = prof.includes('mini') ? '_1_2' : '_2_2';
    }

    if (!code) return null;

    let colorFieldKeywords = [];
    if (code === '_1_1') colorFieldKeywords = ['farbwahl_alu_mini', 'farbwahl alu mini'];
    else if (code === '_2_1') colorFieldKeywords = ['farbwahl_alu_maxi', 'farbwahl alu maxi'];
    else if (code === '_1_2') colorFieldKeywords = ['farbwahl_pvc_mini', 'farbwahl pvc mini'];
    else if (code === '_2_2') colorFieldKeywords = ['farbwahl_pvc_maxi', 'farbwahl pvc maxi'];

    let colorInput = null;
    if (colorFieldKeywords.length > 0) {
      colorInput = Array.from(document.querySelectorAll('input[type="radio"]:checked')).find(el =>
        el.name && colorFieldKeywords.some(kw => el.name.toLowerCase().includes(kw))
      );
    }

    const isSpecial = colorInput && colorInput.value && (colorInput.value.toLowerCase().includes('special') || colorInput.value.toLowerCase().includes('sonder') || colorInput.value.toLowerCase().includes('(s)'));

    return { code, isSpecial };
  },

  /**
   * Calculate minimum price based on MPC
   */
  calculateMinPrice() {
    const mpc = this.detectMPC();
    if (!mpc || !this.minPriceTable[mpc.code]) return null;

    const priceObj = this.minPriceTable[mpc.code];
    const pricePerSqM = mpc.isSpecial ? priceObj.special : priceObj.standard;
    return pricePerSqM;
  },

  /**
   * Trigger the HORIZON minimum pricing logic
   */
  triggerMinimumPricingLogic() {
    const productInfo = document.querySelector('.product-information');
    if (!productInfo) return;

    // Dispatch event for minimum pricing script to listen to
    const event = new CustomEvent('easify:measurementchange', {
      detail: {
        width: this.state.currentWidth,
        height: this.state.currentHeight,
        area: this.state.currentArea,
        price: this.state.currentPrice,
      },
      bubbles: true,
    });

    productInfo.dispatchEvent(event);

    // Only display minimum price if area is strictly less than 1.0 m²
    // If area >= 1.0 m², the requirement is met and no adjustment is needed
    if (this.state.currentArea > 0 && this.state.currentArea < this.config.minAreaM2) {
      const minPricePerSqM = this.calculateMinPrice();
      this.state.currentMPC = this.detectMPC();
      // Store the total minimum price: charge for at least 1.0 m² regardless of actual area
      // Formula: price_per_m² × max(actual_area, minimum_area)
      const newMinPrice = minPricePerSqM * Math.max(this.state.currentArea, this.config.minAreaM2);
      const priceChanged = Math.abs((this.state.currentMinPrice || 0) - newMinPrice) > 0.01;
      this.state.currentMinPrice = newMinPrice;
      
      console.log(
        `[EasifyOptionsHook] ⚠ Area ${this.state.currentArea.toFixed(3)} m² is BELOW minimum ${this.config.minAreaM2} m² — applying minimum price (MPC: ${this.state.currentMPC ? this.state.currentMPC.code + (this.state.currentMPC.isSpecial ? ' special' : ' standard') : 'unknown'}), €${minPricePerSqM.toFixed(2)}/m² × max(${this.state.currentArea.toFixed(3)}, ${this.config.minAreaM2}) = €${this.state.currentMinPrice.toFixed(2)}`
      );
      // Ensure the theme knows minimum pricing is active so original prices are hidden immediately
      const root = document.querySelector('.product-information');
      if (root) root.setAttribute('data-minprice', 'active');
      this.displayMinimumPriceWarning();
      // Always restart continuous override to apply current price
      this._startContinuousOverride();
    } else if (this.state.currentArea >= this.config.minAreaM2) {
      console.log(
        `[EasifyOptionsHook] ✓ Area ${this.state.currentArea.toFixed(3)} m² meets or exceeds minimum ${this.config.minAreaM2} m² — no adjustment needed`
      );
      // Stop continuous override
      this._stopContinuousOverride();
      // Restore original prices
      this.restorePriceDisplay();
      // Reset log tracker
      this.state._lastLoggedMinPrice = null;
      // Hide minimum price UI and restore theme prices if previously shown
      const root = document.querySelector('.product-information');
      if (root) root.setAttribute('data-minprice', 'inactive');
      const minBox = document.querySelector('#minprice-wrap');
      if (minBox && this.state._minimumShown) {
        try {
          // Respect theme control attribute as well
          minBox.setAttribute('minprice-active', 'false');
        } catch (e) {}
        try {
          minBox.style.setProperty('display', 'none', 'important');
          minBox.style.setProperty('visibility', 'hidden', 'important');
        } catch (e) {
          minBox.style.display = 'none';
        }
        if (minBox.dataset) {
          minBox.dataset.easifyMinShown = '0';
        }
        // also clear product-info flag
        try { const rootEl = document.querySelector('.product-information'); if (rootEl) rootEl.setAttribute('data-minprice', 'inactive'); } catch (e) {}
        this.state._minimumShown = false;
      }
      // Remove overlay if present
      try {
        const overlay = document.querySelector('#minprice-overlay');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      } catch (e) {}
    }
  },

  /**
   * Display minimum price warning and recalculate price
   */
  displayMinimumPriceWarning() {
    // Ensure a visible, accessible min-price box exists and is placed before Add-to-cart
    let minBox = document.querySelector('#minprice-wrap');
    const areaKey = String(this.state.currentArea.toFixed(3));

    if (!minBox) {
      minBox = document.createElement('div');
      minBox.id = 'minprice-wrap';
      minBox.setAttribute('role', 'alert');
      minBox.setAttribute('aria-live', 'polite');
      // Minimal inline styles to guarantee visibility regardless of theme CSS
      minBox.style.display = 'block';
      minBox.style.margin = '12px 0';
      minBox.style.padding = '8px';
      minBox.style.background = '#fff3cd';
      minBox.style.border = '2px solid #ffc107';
      minBox.style.borderRadius = '6px';
      minBox.style.color = '#856404';
      minBox.style.fontWeight = '600';
      minBox.style.zIndex = '9999';
    }

    // Find a logical insertion point: before the primary Add-to-cart button inside the product form
    const form = document.querySelector('form[action*="cart"]') || document.querySelector('form');
    let insertBeforeNode = null;
    if (form) {
      insertBeforeNode = form.querySelector('button[type="submit"], button[data-add-to-cart], [data-add-to-cart]');
    }

    // Fallback: try product-information container
    const productInfo = document.querySelector('.product-information') || document.querySelector('.product-details') || document.body;

    if (insertBeforeNode && insertBeforeNode.parentNode) {
      // If minBox is already in DOM somewhere else, move it
      if (minBox.parentNode && minBox.parentNode !== insertBeforeNode.parentNode) {
        minBox.parentNode.removeChild(minBox);
      }
      insertBeforeNode.parentNode.insertBefore(minBox, insertBeforeNode);
    } else if (!minBox.parentNode || minBox.parentNode === document.body) {
      // Place at top of product info as a fallback
      productInfo.insertBefore(minBox, productInfo.firstChild);
    }

    // Render content with MPC-based minimum price - ALWAYS update
    const minPrice = this.state.currentMinPrice;
    const minPricePerSqM = this.calculateMinPrice();
    const mpc = this.state.currentMPC || this.detectMPC();
    const mpcInfo = mpc ? `${mpc.code} (${mpc.isSpecial ? 'Sonderfarbe' : 'Standard'})` : 'N/A';
    const priceDisplay = minPrice ? `€${minPrice.toFixed(2)}` : 'N/A';
    const perSqMDisplay = minPricePerSqM ? `€${minPricePerSqM.toFixed(2)}/m²` : 'N/A';
    const newHtml = `<strong>Mindestpreis (${mpcInfo}):</strong> ${perSqMDisplay} × max(${this.state.currentArea.toFixed(3)}, 1,0) m² = ${priceDisplay}`;
    
    // Only update HTML if it changed to avoid unnecessary DOM updates
    if (minBox.innerHTML !== newHtml) {
      minBox.innerHTML = newHtml;
    }

    if (minBox.dataset) {
      minBox.dataset.easifyMinShown = '1';
      minBox.dataset.easifyMinArea = areaKey;
    }

    // Ensure visible (override theme CSS if necessary)
    try {
      // Theme consumers may expect this attribute; set it so theme CSS shows the box
      minBox.setAttribute('minprice-active', 'true');
    } catch (e) {}

    // Also ensure the product-info root knows minimum pricing is active
    try {
      const rootEl = document.querySelector('.product-information');
      if (rootEl) rootEl.setAttribute('data-minprice', 'active');
    } catch (e) {}

    // Force visible using !important so theme CSS can't hide it
    try {
      minBox.style.setProperty('display', 'block', 'important');
      minBox.style.setProperty('visibility', 'visible', 'important');
      minBox.style.setProperty('opacity', '1', 'important');
      minBox.style.setProperty('position', 'relative', 'important');
      minBox.style.setProperty('z-index', '999999', 'important');
    } catch (e) {
      minBox.style.display = 'block';
    }
    this.state._minimumShown = true;
    // Only log if the price changed (reduce console spam)
    if (this.state._lastLoggedMinPrice !== this.state.currentMinPrice) {
      console.log('[EasifyOptionsHook] Minimum price warning displayed: €' + this.state.currentMinPrice.toFixed(2));
      this.state._lastLoggedMinPrice = this.state.currentMinPrice;
    }

    // If the inserted minBox is still not visible (theme CSS hiding it or parent clipping),
    // create a temporary fixed overlay so the message is guaranteed visible for debugging.
    try {
      const cs = getComputedStyle(minBox);
      const rect = minBox.getBoundingClientRect();
      const hidden = cs.display === 'none' || rect.width === 0 || rect.height === 0 || cs.visibility === 'hidden';
      if (hidden) {
        let overlay = document.querySelector('#minprice-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'minprice-overlay';
          overlay.setAttribute('role', 'status');
          overlay.setAttribute('aria-live', 'assertive');
          overlay.style.position = 'fixed';
          overlay.style.left = '50%';
          overlay.style.transform = 'translateX(-50%)';
          overlay.style.top = '12px';
          overlay.style.maxWidth = 'min(900px, 92vw)';
          overlay.style.width = 'auto';
          overlay.style.padding = '12px 16px';
          overlay.style.background = '#d9534f';
          overlay.style.color = '#fff';
          overlay.style.borderRadius = '6px';
          overlay.style.boxShadow = '0 6px 24px rgba(0,0,0,0.35)';
          overlay.style.zIndex = '2147483647';
          overlay.style.fontWeight = '700';
          overlay.style.fontSize = '14px';
          overlay.style.lineHeight = '1.2';
          overlay.style.textAlign = 'center';
          overlay.style.pointerEvents = 'none';
        }

        const minPrice = this.state.currentMinPrice || this.calculateMinPrice();
        const priceDisplay = minPrice ? `€${minPrice.toFixed(2)}` : 'N/A';
        overlay.textContent = `Mindestpreis (1 m²): ${priceDisplay} · Fläche: ${this.state.currentArea.toFixed(3)} m²`;
        if (!overlay.parentNode) document.body.appendChild(overlay);
        // Also keep a marker so hide logic can remove it
        minBox.dataset.easifyOverlayShown = '1';
        console.log('[EasifyOptionsHook] Min-price overlay inserted (debug fallback)');
      }
    } catch (e) {
      /* ignore overlay creation errors */
    }
  },

  /**
   * Override displayed price when minimum pricing is active
   */
  overridePriceDisplay() {
    if (!this.state.currentMinPrice || this.state.currentArea >= this.config.minAreaM2) {
      return; // No override needed
    }

    const formatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const priceText = formatter.format(this.state.currentMinPrice);
    
    let updated = false;
    
    // Override Easify's additional price display (the main visible price)
    const easifyPrices = document.querySelectorAll('.tpo_total-additional-price');
    easifyPrices.forEach(el => {
      if (!el.hasAttribute('data-minprice-override-locked')) {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        
        if (!el.hasAttribute('data-original-price')) {
          el.setAttribute('data-original-price', el.textContent.trim());
        }
        
        el.textContent = priceText;
        el.setAttribute('data-minprice-override-locked', 'true');
        updated = true;
        console.log(`[EasifyOptionsHook] Override Easify additional price: ${priceText}`);
      }
    });
    
    // Also override theme .price elements
    const priceElements = document.querySelectorAll('.price');
    priceElements.forEach(el => {
      if (!el.hasAttribute('data-minprice-override-locked')) {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        
        if (!el.hasAttribute('data-original-price')) {
          el.setAttribute('data-original-price', el.textContent.trim());
        }
        
        el.textContent = priceText;
        el.setAttribute('data-minprice-override-locked', 'true');
        updated = true;
      }
    });
    
    if (updated) {
      console.log(`[EasifyOptionsHook] Price override applied: ${priceText}`);
    }
  },

  /**
   * Restore original prices when area >= 1 m²
   */
  restorePriceDisplay() {
    const overriddenElements = document.querySelectorAll('[data-minprice-override-locked="true"]');
    overriddenElements.forEach(el => {
      const originalPrice = el.getAttribute('data-original-price');
      if (originalPrice) {
        el.textContent = originalPrice;
        console.log(`[EasifyOptionsHook] Restored original price: ${originalPrice}`);
      }
      el.removeAttribute('data-minprice-override-locked');
    });
  },

  /**
   * Apply minimum pricing to cart before submission
   */
  applyMinimumPricingToCart() {
    // This would be called on form submit to enforce minimum pricing
    // The actual pricing is handled server-side by Shopify/Easify
    console.log('[EasifyOptionsHook] Applying minimum pricing to cart items');
  },

  /**
   * Public method to get current measurements
   */
  getMeasurements() {
    return {
      width: this.state.currentWidth,
      height: this.state.currentHeight,
      area: this.state.currentArea,
      minAreaM2: this.config.minAreaM2,
      isMinimumApplied: this.state.currentArea < this.config.minAreaM2,
    };
  },

  /**
   * Test helper: simulate entering measurements into the first width/height input pair
   * Usage: EasifyOptionsHook.testSimulateMeasurements(1000, 1000)
   */
  testSimulateMeasurements(widthMm, heightMm) {
    const inputs = document.querySelectorAll('input[name*="Abmessung"]');
    let widthInput = null, heightInput = null;

    inputs.forEach((input) => {
      if (!widthInput && input.name.includes('Breite')) {
        widthInput = input;
      }
      if (!heightInput && input.name.includes('Höhe')) {
        heightInput = input;
      }
    });

    if (widthInput) {
      widthInput.value = widthMm;
      widthInput.dispatchEvent(new Event('input', { bubbles: true }));
      widthInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[EasifyOptionsHook] Test: Set width input to ${widthMm}mm`);
    } else {
      console.warn(`[EasifyOptionsHook] Test: Width input not found`);
    }

    if (heightInput) {
      heightInput.value = heightMm;
      heightInput.dispatchEvent(new Event('input', { bubbles: true }));
      heightInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[EasifyOptionsHook] Test: Set height input to ${heightMm}mm`);
    } else {
      console.warn(`[EasifyOptionsHook] Test: Height input not found`);
    }
  },
};

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      EasifyOptionsHook.init();
    }, 500); // Wait 500ms for Easify to initialize
  });
} else {
  setTimeout(() => {
    EasifyOptionsHook.init();
  }, 500);
}

// Expose for debugging
window.EasifyOptionsHook = EasifyOptionsHook;
console.log('✓ EasifyOptionsHook loaded. Run: EasifyOptionsHook.getMeasurements()');
