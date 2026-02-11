window.RollerConfig = {
  state: {
    material: 'alu',
    profile: 'mini',
    width: 0,
    height: 0,
    color: 'beige',
    area: 0,
    minPrice: 0,
    totalPrice: 0,
    quantity: 1,

    endleiste: {
      enabled: true,
      color: 'silber_eloxiert',
      holes: true,
      price: 0
    }
  },

  assetBaseUrl: '',

  priceTable: {
    alu_mini_standard: 33.60,
    alu_mini_special: 34.68,
    alu_maxi_standard: 37.15,
    alu_maxi_special: 37.91,
    pvc_mini_standard: 23.22,
    pvc_mini_special: 24.67,
    pvc_maxi_standard: 24.58,
    pvc_maxi_special: 25.58
  },

  constraints: {
    alu_mini: { width: [100, 3000], height: [100, 2500], maxArea: 7.0 },
    alu_maxi: { width: [100, 4000], height: [100, 2500], maxArea: 8.0 },
    pvc_mini: { width: [100, 1600], height: [100, 2300], maxArea: 3.0 },
    pvc_maxi: { width: [100, 2400], height: [100, 2300], maxArea: 4.3 }
  },

  colorOptions: {
    pvc_mini: [
      { id: 'beige', label: 'Beige', hex: '#E0D1C2' },
      { id: 'weiss', label: 'Weiß', hex: '#F6F7F2' },
      { id: 'grau', label: 'Grau', hex: '#DFE3E0' },
      { id: 'altweiss', label: 'Altweiß (S)', hex: '#EBE9DA' },
      { id: 'hellelfenbein', label: 'Hellelfenbein (S)', hex: '#F0DDB2' },
      { id: 'holzhell', label: 'Holz hell (S)', hex: '#BD8449' },
      { id: 'oregon', label: 'Oregon (S)', hex: '#B25D42' },
      { id: 'holzdunkel', label: 'Holz dunkel (S)', hex: '#936640' },
      { id: 'graubraun', label: 'Graubraun (S)', hex: '#362313' }
    ],
    pvc_maxi: [
      { id: 'beige', label: 'Beige', hex: '#E0D1C2' },
      { id: 'weiss', label: 'Weiß', hex: '#F6F7F2' },
      { id: 'grau', label: 'Grau', hex: '#DFE3E0' },
      { id: 'altweiss', label: 'Altweiß (S)', hex: '#EBE9DA' },
      { id: 'hellelfenbein', label: 'Hellelfenbein (S)', hex: '#F0DDB2' },
      { id: 'holzhell', label: 'Holz hell (S)', hex: '#BD8449' },
      { id: 'oregon', label: 'Oregon (S)', hex: '#B25D42' },
      { id: 'holzdunkel', label: 'Holz dunkel (S)', hex: '#936640' },
      { id: 'graubraun', label: 'Graubraun (S)', hex: '#362313' }
    ],
    alu_mini: [
      { id: 'beige', label: 'Beige', hex: '#E0D1C2' },
      { id: 'weiss', label: 'Weiß', hex: '#F6F7F2' },
      { id: 'grau', label: 'Grau', hex: '#DFE3E0' },
      { id: 'silber', label: 'Silber (S)', hex: '#B0B7B9' },
      { id: 'cremeweiss', label: 'Cremeweiß (S)', hex: '#F7F3E3' },
      { id: 'hellelfenbein', label: 'Hellelfenbein (S)', hex: '#F0DDB2' },
      { id: 'grauweiss', label: 'Grauweiß (S)', hex: '#E0E6DA' },
      { id: 'holzhell', label: 'Holz hell (S)', hex: '#BD8449' },
      { id: 'goldenoak', label: 'GoldenOak (S)', hex: '#9D5430' },
      { id: 'graubraun', label: 'Graubraun (S)', hex: '#362313' },
      { id: 'anthrazitgrau', label: 'Anthrazitgrau (S)', hex: '#192C32' },
      { id: 'eisenglimmer', label: 'Eisenglimmer (S)', hex: '#2F3637' },
      { id: 'moosgruen', label: 'Moosgrün (S)', hex: '#15533D' },
      { id: 'graualuminium', label: 'Graualuminium (S)', hex: '#5D686D' },
      { id: 'perlweiss', label: 'Perlweiß (S)', hex: '#EEDFC4' },
      { id: 'antikweiss', label: 'Antikweiß (S)', hex: '#FFF9EA' },
      { id: 'altweiss', label: 'Altweiß (S)', hex: '#EBE9DA' },
      { id: 'oregon', label: 'Oregon (S)', hex: '#B25D42' },
      { id: 'holzdunkel', label: 'Holz dunkel (S)', hex: '#936640' }
    ],
    alu_maxi: [
      { id: 'beige', label: 'Beige', hex: '#E0D1C2' },
      { id: 'weiss', label: 'Weiß', hex: '#F6F7F2' },
      { id: 'grau', label: 'Grau', hex: '#DFE3E0' },
      { id: 'silber', label: 'Silber (S)', hex: '#B0B7B9' },
      { id: 'cremeweiss', label: 'Cremeweiß (S)', hex: '#F7F3E3' },
      { id: 'hellelfenbein', label: 'Hellelfenbein (S)', hex: '#F0DDB2' },
      { id: 'grauweiss', label: 'Grauweiß (S)', hex: '#E0E6DA' },
      { id: 'holzhell', label: 'Holz hell (S)', hex: '#BD8449' },
      { id: 'goldenoak', label: 'GoldenOak (S)', hex: '#9D5430' },
      { id: 'graubraun', label: 'Graubraun (S)', hex: '#362313' },
      { id: 'anthrazitgrau', label: 'Anthrazitgrau (S)', hex: '#192C32' },
      { id: 'eisenglimmer', label: 'Eisenglimmer (S)', hex: '#2F3637' },
      { id: 'moosgruen', label: 'Moosgrün (S)', hex: '#15533D' },
      { id: 'graualuminium', label: 'Graualuminium (S)', hex: '#5D686D' }
    ]
  },

  colorHexMap: {
    // ... existing
  },

  // TODO: Replace these placeholder IDs with actual Shopify Variant IDs
  skuToIdMap: {
    'ROLLER-ALU-MINI-STD': 56059870675319,
    'ROLLER-ALU-MINI-SPL': 56059870708087,
    'ROLLER-ALU-MAXI-STD': 56059870609783,
    'ROLLER-ALU-MAXI-SPL': 56059870642551,
    'ROLLER-PVC-MINI-STD': 56059870806391,
    'ROLLER-PVC-MINI-SPL': 56059870839159,
    'ROLLER-PVC-MAXI-STD': 56059870740855,
    'ROLLER-PVC-MAXI-SPL': 56059870773623
  },

  endleistColors: {},

  init() {
    console.log('[RollerConfig] Initializing...');
    this.extractAssetBaseUrl();
    this.loadFromStorage();
    this.buildEndleistColors();
    this.renderColorOptions();
    this.renderEndleistColorOptions();
    this.attachEventListeners();
    this.setupToggles();
    this.loadMeasurementVideo();
    this.calculatePrice();
    this.updateRollerImage();
    this.render();
    
    // Handle bfcache (back/forward cache)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[RollerConfig] Page restored from bfcache');
        this.loadFromStorage();
        this.render();
      }
    });

    console.log('[RollerConfig] Ready', this.state);
  },

  buildEndleistColors() {
    const key = `${this.state.material}_${this.state.profile}`;
    const rollerColors = this.colorOptions[key] || [];
    
    this.endleistColors = {
      // 'match': {
      //   label: 'Wie Rollladen',
      //   hex: 'linear-gradient(45deg, #ccc 25%, #eee 25%, #eee 50%, #ccc 50%, #ccc 75%, #eee 75%, #eee 100%)',
      //   price: 0
      // },
      'silber_eloxiert': {
        label: 'Silber eloxiert',
        hex: '#C0C0C0',
        price: 0
      }
    };

    const allowedIds = ['beige', 'weiss', 'grau'];

    rollerColors.forEach(color => {
      // Only add allowed colors
      if (allowedIds.includes(color.id)) {
        // Don't duplicate if already added
        if (!this.endleistColors[color.id]) {
          this.endleistColors[color.id] = {
            label: color.label,
            hex: color.hex,
            price: 0
          };
        }
      }
    });
    
    console.log('[RollerConfig] Built Endleiste colors:', Object.keys(this.endleistColors));
  },

  loadMeasurementVideo() {
    const videoElement = document.getElementById('measurement-video');
    if (videoElement) {
      const videoUrl = this.assetBaseUrl + 'measurement-guide.mp4';
      const source = videoElement.querySelector('source');
      source.src = videoUrl;
      
      videoElement.addEventListener('error', () => {
        const note = document.querySelector('.video-note');
        if (note) note.textContent = 'Video-Anleitung momentan nicht verfügbar. Bitte folgen Sie der bebilderten Anleitung.';
      });

      videoElement.addEventListener('loadeddata', () => {
        const note = document.querySelector('.video-note');
        if (note) note.style.display = 'none';
      });

      videoElement.load();
      console.log('[RollerConfig] Video source set to:', videoUrl);
    }
  },

  extractAssetBaseUrl() {
    const scripts = document.getElementsByTagName('script');
    for (let script of scripts) {
      if (script.src && script.src.includes('roller-config.js')) {
        let url = script.src.split('?')[0];
        this.assetBaseUrl = url.replace('roller-config.js', '');
        console.log('[RollerConfig] Asset base URL:', this.assetBaseUrl);
        return;
      }
    }
  },

  attachEventListeners() {
    document.querySelectorAll('input[name="material"]').forEach(el => {
      el.addEventListener('change', () => this.onMaterialChange());
    });

    document.querySelectorAll('input[name="profile"]').forEach(el => {
      el.addEventListener('change', () => this.onProfileChange());
    });

    document.getElementById('width').addEventListener('change', () => this.onDimensionChange());
    document.getElementById('width').addEventListener('input', () => this.onDimensionChange());
    document.getElementById('width').addEventListener('keyup', () => this.onDimensionChange());
    document.getElementById('width').addEventListener('blur', () => this.onDimensionChange());

    document.getElementById('height').addEventListener('change', () => this.onDimensionChange());
    document.getElementById('height').addEventListener('input', () => this.onDimensionChange());
    document.getElementById('height').addEventListener('keyup', () => this.onDimensionChange());
    document.getElementById('height').addEventListener('blur', () => this.onDimensionChange());

    document.getElementById('quantity').addEventListener('change', () => this.onQuantityChange());
    document.getElementById('quantity').addEventListener('input', () => this.onQuantityChange());
    document.getElementById('quantity-increase').addEventListener('click', (e) => {
      e.preventDefault();
      this.increaseQuantity();
    });
    document.getElementById('quantity-decrease').addEventListener('click', (e) => {
      e.preventDefault();
      this.decreaseQuantity();
    });

    document.getElementById('endleiste-holes').addEventListener('change', () => this.onEndleisteHolesChange());

    document.getElementById('add-to-cart-btn').addEventListener('click', () => this.addToCart());
  },

  setupToggles() {
    document.querySelectorAll('.instructions-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-target');
        const container = document.getElementById(targetId);
        
        if (container) {
          const isHidden = container.style.display === 'none';
          container.style.display = isHidden ? 'block' : 'none';
          btn.classList.toggle('active', isHidden);
          
          // Toggle icon rotation if using CSS transform
          const icon = btn.querySelector('.toggle-icon');
          if (icon) {
             // CSS handles rotation via .active class
          }
        }
      });
    });
  },

  onMaterialChange() {
    const material = document.querySelector('input[name="material"]:checked').value;
    this.state.material = material;

    this.updateDimensionConstraints();
    this.buildEndleistColors();
    this.renderColorOptions();
    this.renderEndleistColorOptions();
    this.calculatePrice();
    this.updateRollerImage();
    this.saveToStorage();
    this.render();

    console.log('[RollerConfig] Material changed to:', material);
  },

  onProfileChange() {
    const profile = document.querySelector('input[name="profile"]:checked').value;
    this.state.profile = profile;

    this.updateDimensionConstraints();
    this.buildEndleistColors();
    this.renderColorOptions();
    this.renderEndleistColorOptions();
    this.calculatePrice();
    this.updateRollerImage();
    this.saveToStorage();
    this.render();

    console.log('[RollerConfig] Profile changed to:', profile);
  },

  onDimensionChange() {
    const width = parseInt(document.getElementById('width').value) || 0;
    const height = parseInt(document.getElementById('height').value) || 0;

    this.state.width = width;
    this.state.height = height;

    this.calculateArea();
    this.validateDimensions();
    this.calculatePrice();
    this.saveToStorage();
    this.render();

    console.log('[RollerConfig] Dimensions changed:', { width, height });
  },

  onEndleisteHolesChange() {
    const isChecked = document.getElementById('endleiste-holes').checked;
    this.state.endleiste.holes = isChecked;
    this.updateRollerImage();
    this.saveToStorage();
    console.log('[RollerConfig] Endleiste holes changed to:', isChecked);
  },

  updateDimensionConstraints() {
    const key = `${this.state.material}_${this.state.profile}`;
    const constraints = this.constraints[key];

    if (constraints) {
      const widthInput = document.getElementById('width');
      const heightInput = document.getElementById('height');
      
      // Update displays
      const widthDisplay = document.getElementById('width-constraints');
      if (widthDisplay) widthDisplay.textContent = `Min: ${constraints.width[0]} mm - Max: ${constraints.width[1]} mm`;
      
      const heightDisplay = document.getElementById('height-constraints');
      if (heightDisplay) heightDisplay.textContent = `Min: ${constraints.height[0]} mm - Max: ${constraints.height[1]} mm`;

      const areaDisplay = document.getElementById('area-constraints');
      if (areaDisplay) areaDisplay.textContent = `Max. Fläche: ${constraints.maxArea} m²`;

      // Update input attributes?
      // Keeping existing validation logic, just updating display as requested.
    }
  },

  validateDimensions() {
    const key = `${this.state.material}_${this.state.profile}`;
    const constraint = this.constraints[key];
    const widthError = document.getElementById('width-error');
    const heightError = document.getElementById('height-error');
    const areaError = document.getElementById('area-error');
    const addToCartBtn = document.getElementById('add-to-cart-btn');

    if (widthError) widthError.textContent = '';
    if (heightError) heightError.textContent = '';
    if (areaError) areaError.textContent = '';
    
    let isValid = true;

    if (constraint) {
      if (this.state.width < constraint.width[0] || this.state.width > constraint.width[1]) {
        if (widthError) widthError.textContent = `Breite muss zwischen ${constraint.width[0]} mm und ${constraint.width[1]} mm liegen.`;
        isValid = false;
      }
      if (this.state.height < constraint.height[0] || this.state.height > constraint.height[1]) {
        if (heightError) heightError.textContent = `Höhe muss zwischen ${constraint.height[0]} mm und ${constraint.height[1]} mm liegen.`;
        isValid = false;
      }
      
      // Check Max Area
      if (constraint.maxArea && this.state.area > constraint.maxArea) {
        if (areaError) {
          areaError.textContent = `Maximale Fläche von ${constraint.maxArea} m² überschritten (Aktuell: ${this.state.area.toFixed(2)} m²). Bitte Maße reduzieren.`;
        }
        isValid = false;
      }
    }
    
    // Disable add to cart if invalid
    if (addToCartBtn) {
       addToCartBtn.disabled = !isValid;
    }
    
    return isValid;
  },

  calculateArea() {
    if (this.state.width > 0 && this.state.height > 0) {
      this.state.area = (this.state.width * this.state.height) / 1000000;
    } else {
      this.state.area = 0;
    }
  },

  isSpecialColor(colorId) {
    const standardColors = ['beige', 'weiss', 'grau'];
    return colorId && !standardColors.includes(colorId);
  },

  calculatePrice() {
    // Ensure area is treated as a number
    const currentArea = Number(this.state.area);
    const chargeableArea = Math.max(currentArea, 1.0);
    
    // Get Base Price (Standard Color)
    const baseKey = `${this.state.material}_${this.state.profile}_standard`;
    const basePricePerM2 = this.priceTable[baseKey] || 30;

    // Get Actual Price (Current Color)
    const colorType = this.isSpecialColor(this.state.color) ? 'special' : 'standard';
    const key = `${this.state.material}_${this.state.profile}_${colorType}`;
    const pricePerM2 = this.priceTable[key] || basePricePerM2;

    // Calculate components
    const totalBase = basePricePerM2 * chargeableArea;
    const surchargePerM2 = pricePerM2 - basePricePerM2;
    const totalSurcharge = surchargePerM2 * chargeableArea;

    // Calculate Unit Price first (rounded to 2 decimals) to ensure consistency
    const rawBasePrice = pricePerM2 * chargeableArea;
    const unitPrice = Math.round(rawBasePrice * 100) / 100;
    
    // Total is Unit Price * Quantity
    const total = unitPrice * this.state.quantity;

    this.state.minPrice = pricePerM2; // Store Price per m2 for property
    this.state.chargeableArea = chargeableArea;
    this.state.totalPrice = total;
    
    // Store breakdown for render
    this.state.priceBreakdown = {
      base: totalBase * this.state.quantity,
      surcharge: totalSurcharge * this.state.quantity
    };

    console.log('[RollerConfig] Price calculated:', {
      rawArea: this.state.area,
      area: currentArea.toFixed(3),
      chargeableArea: chargeableArea.toFixed(3),
      colorType: colorType,
      pricePerM2: pricePerM2,
      unitPrice: unitPrice.toFixed(2),
      breakdown: this.state.priceBreakdown,
      quantity: this.state.quantity,
      total: total.toFixed(2)
    });
  },

  onQuantityChange() {
    const quantity = parseInt(document.getElementById('quantity').value) || 1;
    const validQuantity = Math.max(1, Math.min(quantity, 999));
    this.state.quantity = validQuantity;
    document.getElementById('quantity').value = validQuantity;
    this.calculatePrice();
    this.saveToStorage();
    this.render();
    console.log('[RollerConfig] Quantity changed to:', validQuantity);
  },

  increaseQuantity() {
    const quantity = Math.min(this.state.quantity + 1, 999);
    document.getElementById('quantity').value = quantity;
    this.onQuantityChange();
  },

  decreaseQuantity() {
    const quantity = Math.max(this.state.quantity - 1, 1);
    document.getElementById('quantity').value = quantity;
    this.onQuantityChange();
  },

  renderColorOptions() {
    const container = document.getElementById('color-options');
    container.innerHTML = '';

    const key = `${this.state.material}_${this.state.profile}`;
    const colors = this.colorOptions[key] || [];

    // Separate colors into standard and special
    const standardColors = [];
    const specialColors = [];

    colors.forEach(color => {
      if (this.isSpecialColor(color.id)) {
        specialColors.push(color);
      } else {
        standardColors.push(color);
      }
    });

      const renderGroup = (groupColors, title) => {
      if (groupColors.length === 0) return;

      const groupContainer = document.createElement('div');
      groupContainer.className = 'color-group';
      
      const heading = document.createElement('h4');
      heading.textContent = title;
      heading.className = 'color-group-heading';
      groupContainer.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'color-grid';

      groupColors.forEach(color => {
        const label = document.createElement('label');
        label.className = 'color-option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'color';
        input.value = color.id;
        input.checked = color.id === this.state.color;

        const woodColors = ['holzhell', 'goldenoak', 'oregon', 'holzdunkel'];
        const isWood = woodColors.includes(color.id);
        
        // Natural wood grain texture using SVG filter (horizontal grain)
        // baseFrequency="0.005 0.6" creates much finer/thinner horizontal lines
        // Increased opacity to 0.6 for higher contrast
        const woodSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.005 0.6' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='2' intercept='-0.5'/%3E%3CfeFuncG type='linear' slope='2' intercept='-0.5'/%3E%3CfeFuncB type='linear' slope='2' intercept='-0.5'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E";
        
        // Combine lighting (3D slat effect) + wood grain texture
        const woodGradient = `linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.1) 100%), url("${woodSvg}")`;

        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.setAttribute('data-color-hex', color.hex);

        // Apply styles individually with priority - RECTANGULAR SLAT STYLE
        swatch.style.setProperty('width', '100%', 'important');
        swatch.style.setProperty('height', '40px', 'important');
        swatch.style.setProperty('min-width', '100%', 'important');
        swatch.style.setProperty('min-height', '40px', 'important');
        swatch.style.setProperty('border-radius', '4px', 'important');
        swatch.style.setProperty('border', '1px solid #999', 'important');
        swatch.style.setProperty('display', 'block', 'important');
        swatch.style.setProperty('flex-shrink', '0', 'important');
        swatch.style.setProperty('margin-right', '0', 'important');
        swatch.style.setProperty('margin-bottom', '5px', 'important');
        swatch.style.setProperty('box-shadow', 'inset 0 1px 3px rgba(0,0,0,0.1)', 'important');
        
        // Background color
        if (color.hex) {
            swatch.style.setProperty('background-color', color.hex, 'important');
        } else {
            swatch.style.setProperty('background-color', '#ccc', 'important');
        }

        // Wood gradient
        if (isWood) {
          swatch.style.setProperty('background-image', woodGradient, 'important');
        } else {
          swatch.style.setProperty('background-image', 'none', 'important');
        }

        const span = document.createElement('span');
        span.innerHTML = `<span style="display: block; font-weight: 500; font-size: 1.1rem;">${color.label}</span>`;
        
        // Create a row for input and text
        const row = document.createElement('div');
        row.className = 'color-option-row';
        row.appendChild(input);
        row.appendChild(span);

        input.addEventListener('change', () => {
          this.state.color = color.id;
          this.calculatePrice();
          if (this.state.endleiste.color === 'match') {
            this.renderEndleistColorOptions();
          }
          this.updateRollerImage();
          this.saveToStorage();
          this.render();
          console.log('[RollerConfig] Color changed to:', color.id);
        });

        // Reorder: Swatch first, then Row (Input + Label)
        label.appendChild(swatch);
        label.appendChild(row);
        grid.appendChild(label);
      });

      groupContainer.appendChild(grid);
      container.appendChild(groupContainer);
    };

    // Render Standard Colors
    renderGroup(standardColors, 'Standardfarben');

    // Render Special Colors
    renderGroup(specialColors, 'Sonderfarben');
  },

  renderEndleistColorOptions() {
    const container = document.getElementById('endleiste-color-options');
    container.innerHTML = '';

    const colorIds = Object.keys(this.endleistColors);
    
    if (colorIds.length === 0) {
      container.innerHTML = '<p>Keine Farben verfügbar</p>';
      return;
    }

    if (!this.endleistColors[this.state.endleiste.color]) {
      this.state.endleiste.color = colorIds[0];
    }

    // Use a grid layout for single row/wrapping
    const grid = document.createElement('div');
    grid.className = 'color-grid';

    Object.entries(this.endleistColors).forEach(([key, color]) => {
      const label = document.createElement('label');
      label.className = 'color-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'endleiste-color';
      input.value = key;
      input.checked = key === this.state.endleiste.color;

      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.setAttribute('data-color-hex', color.hex);

      // Robust style application
      swatch.style.setProperty('width', '100%', 'important');
      swatch.style.setProperty('height', '40px', 'important');
      swatch.style.setProperty('min-width', '100%', 'important');
      swatch.style.setProperty('min-height', '40px', 'important');
      swatch.style.setProperty('border-radius', '4px', 'important');
      swatch.style.setProperty('border', '1px solid #999', 'important');
      swatch.style.setProperty('display', 'block', 'important');
      swatch.style.setProperty('flex-shrink', '0', 'important');
      swatch.style.setProperty('margin-right', '0', 'important');
      swatch.style.setProperty('margin-bottom', '5px', 'important');
      swatch.style.setProperty('box-shadow', 'inset 0 1px 3px rgba(0,0,0,0.1)', 'important');
      swatch.style.setProperty('background-image', 'none', 'important');

      if (color.hex) {
        swatch.style.setProperty('background-color', color.hex, 'important');
      } else {
        swatch.style.setProperty('background-color', '#ccc', 'important');
      }

      const span = document.createElement('span');
      span.innerHTML = `<span style="display: block; font-weight: 500;">${color.label}</span>`;

      // Create a row for input and text
      const row = document.createElement('div');
      row.className = 'color-option-row';
      row.appendChild(input);
      row.appendChild(span);

      input.addEventListener('change', () => {
        this.state.endleiste.color = key;
        this.saveToStorage();
        this.render();
        console.log('[RollerConfig] Endleiste color changed to:', key);
      });

      label.appendChild(swatch);
      label.appendChild(row);
      grid.appendChild(label);
    });

    container.appendChild(grid);
  },

  updateRollerImage() {
    const img = document.getElementById('roller-image');
    if (!img) return;

    const baseFilename = `roller-${this.state.profile}-${this.state.color}`;
    // Convention: 
    // - With Stopper: -stopper.png
    // - Without Stopper: -nostopper.png
    // - Fallback: .png
    const suffix = this.state.endleiste.holes ? '-stopper' : '-nostopper';
    
    const specificUrl = this.assetBaseUrl + baseFilename + suffix + '.png';
    const genericUrl = this.assetBaseUrl + baseFilename + '.png';

    img.onerror = () => {
      img.onerror = null; // Prevent loop
      console.warn('[RollerConfig] Image not found:', specificUrl, 'falling back to:', genericUrl);
      img.src = genericUrl;
    };

    img.src = specificUrl;
    console.log('[RollerConfig] Updating image to:', specificUrl);
  },

  render() {
    document.getElementById('area-display').textContent = this.state.area.toFixed(3);
    document.getElementById('total-price').textContent = this.state.totalPrice.toFixed(2);

    // Price Breakdown Display
    const detailsDiv = document.getElementById('price-details');
    const baseDisplay = document.getElementById('base-price-display');
    const surchargeRow = document.getElementById('surcharge-row');
    const surchargeDisplay = document.getElementById('surcharge-display');

    if (detailsDiv && this.state.priceBreakdown) {
      if (this.state.priceBreakdown.surcharge > 0.01) {
        detailsDiv.style.display = 'block';
        baseDisplay.textContent = this.state.priceBreakdown.base.toFixed(2) + ' €';
        surchargeDisplay.textContent = this.state.priceBreakdown.surcharge.toFixed(2) + ' €';
        surchargeRow.style.display = 'flex';
      } else {
        detailsDiv.style.display = 'none';
      }
    }

    const chargeableWrapper = document.getElementById('chargeable-area-wrapper');
    const chargeableDisplay = document.getElementById('chargeable-area-display');
    const minWarning = document.getElementById('minimum-warning');

    if (this.state.area > 0 && this.state.area < 1.0) {
      if (chargeableWrapper) chargeableWrapper.style.display = 'inline';
      if (chargeableDisplay) chargeableDisplay.textContent = '1.000';
      if (minWarning) minWarning.style.display = 'block';
    } else {
      if (chargeableWrapper) chargeableWrapper.style.display = 'none';
      if (minWarning) minWarning.style.display = 'none';
    }
  },

  saveToStorage() {
    try {
      localStorage.setItem('roller-config', JSON.stringify(this.state));
    } catch (e) {
      console.warn('[RollerConfig] localStorage save failed:', e);
    }
  },

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('roller-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = { ...this.state, ...parsed };

        document.querySelector(`input[name="material"][value="${this.state.material}"]`).checked = true;
        document.querySelector(`input[name="profile"][value="${this.state.profile}"]`).checked = true;
        document.getElementById('width').value = this.state.width;
        document.getElementById('height').value = this.state.height;
        document.getElementById('quantity').value = this.state.quantity;
        document.getElementById('endleiste-holes').checked = this.state.endleiste.holes;

        console.log('[RollerConfig] Loaded from storage:', this.state);
      }
    } catch (e) {
      console.warn('[RollerConfig] localStorage load failed:', e);
    }
  },

  getVariantId() {
    const colorType = this.isSpecialColor(this.state.color) ? 'SPL' : 'STD';
    const materialUpper = this.state.material.toUpperCase();
    const profileUpper = this.state.profile === 'mini' ? 'MINI' : 'MAXI';
    return `ROLLER-${materialUpper}-${profileUpper}-${colorType}`;
  },

  addToCart() {
    console.log('[RollerConfig] Adding to cart...');

    // Force recalculation to ensure state is fresh
    this.calculatePrice();

    if (this.state.width <= 0 || this.state.height <= 0) {
      alert('Bitte geben Sie gültige Abmessungen ein');
      return;
    }

    const btn = document.getElementById('add-to-cart-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Wird hinzugefügt...';

    const sku = this.getVariantId();
    const variantId = this.skuToIdMap[sku];
    console.log('[RollerConfig] Using SKU:', sku, 'Mapped to ID:', variantId);

    if (!variantId) {
      console.error('[RollerConfig] No Variant ID found for SKU:', sku);
      alert('Produkt-Variante nicht konfiguriert. Bitte kontaktieren Sie den Support.');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }

    const key = `${this.state.material}_${this.state.profile}`;
    const colorObj = this.colorOptions[key]?.find(c => c.id === this.state.color);
    const colorLabel = colorObj?.label || this.state.color;

    let endleistColorLabel = this.state.endleiste.color;
    if (this.state.endleiste.color === 'match') {
      endleistColorLabel = colorLabel + ' (Abgestimmt)';
    } else if (this.endleistColors[this.state.endleiste.color]) {
      endleistColorLabel = this.endleistColors[this.state.endleiste.color].label;
    }

    // Using 0.01 EUR variant price strategy as configured in Shopify Admin
    // We send the total price in cents as the quantity so that (Cents * 0.01) = Total Price
    const shopifyQuantity = Math.round(this.state.totalPrice * 100);

    const projectRef = document.getElementById('project-ref')?.value || '';

    const cartItem = {
      id: variantId, // Using 'id' for Shopify AJAX API
      quantity: shopifyQuantity,
      properties: {
        'Projekt': projectRef,
        'Quantity (Rollers)': this.state.quantity,
        'Width (mm)': this.state.width,
        'Height (mm)': this.state.height,
        'Material': this.state.material === 'alu' ? 'Aluminium' : 'PVC',
        'Profile': this.state.profile === 'mini' ? 'Mini (37mm)' : 'Maxi (52mm)',
        'Color': colorLabel,
        'Base Price (EUR)': this.state.minPrice.toFixed(2) || '0.00',
        'Surcharges (EUR)': this.state.priceBreakdown?.surcharge.toFixed(2) || '0.00',
        'Actual Area (m2)': this.state.area.toFixed(3),
        'Chargeable Area (m2)': this.state.chargeableArea.toFixed(3),
        'Endleiste_Color': endleistColorLabel,
        'Endleiste_Holes': this.state.endleiste.holes ? 'Yes' : 'No'
      }
    };

    fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ items: [cartItem] })
    })
    .then(response => {
      return response.json().then(data => {
        if (!response.ok) {
          throw new Error(data.description || data.message || `HTTP ${response.status}`);
        }
        return data;
      });
    })
    .then(data => {
      console.log('[RollerConfig] Cart response:', data);
      
      // Reset quantity to 1 for next session
      this.state.quantity = 1;
      this.saveToStorage();
      
      window.location.href = '/cart';
    })
    .catch(error => {
      console.error('[RollerConfig] Cart error:', error);
      alert(`Fehler beim Hinzufügen zum Warenkorb:\n${error.message}`);
      btn.disabled = false;
      btn.textContent = originalText;
    });
  }
};

window.MeasurementInstructions = {
  init() {
    const toggle = document.querySelector('.instructions-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggleInstructions());
    }
  },

  toggleInstructions() {
    const container = document.getElementById('instructions-container');
    const toggle = document.querySelector('.instructions-toggle');
    
    if (container.style.display === 'none') {
      container.style.display = 'block';
      toggle.classList.add('active');
    } else {
      container.style.display = 'none';
      toggle.classList.remove('active');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  RollerConfig.init();
  MeasurementInstructions.init();
});
