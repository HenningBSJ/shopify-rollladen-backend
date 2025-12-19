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
      color: 'beige',
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
    alu_mini: { width: [100, 3000], height: [100, 2500] },
    alu_maxi: { width: [100, 3000], height: [100, 2500] },
    pvc_mini: { width: [100, 2500], height: [100, 2300] },
    pvc_maxi: { width: [100, 2500], height: [100, 2300] }
  },

  colorOptions: {
    pvc_mini: [
      { id: 'beige', label: 'Beige', hex: '#E0D1C2' },
      { id: 'weiss', label: 'Weiß', hex: '#F6F7F2' },
      { id: 'grau', label: 'Grau', hex: '#DFE3E0' },
      { id: 'altweiss', label: 'Altweiß (S)', hex: '#B0B7B9' },
      { id: 'hellelfenbein', label: 'Hellelfenbein (S)', hex: '#F7F3E3' },
      { id: 'holzhell', label: 'Holz hell (S)', hex: '#F0DDB2' },
      { id: 'oregon', label: 'Oregon (S)', hex: '#E0E6DA' },
      { id: 'holzdunkel', label: 'Holz dunkel (S)', hex: '#BD8449' },
      { id: 'graubraun', label: 'Graubraun (S)', hex: '#9D5430' }
    ],
    pvc_maxi: [
      { id: 'beige', label: 'Beige', hex: '#E0D1C2' },
      { id: 'weiss', label: 'Weiß', hex: '#F6F7F2' },
      { id: 'grau', label: 'Grau', hex: '#DFE3E0' },
      { id: 'altweiss', label: 'Altweiß (S)', hex: '#B0B7B9' },
      { id: 'hellelfenbein', label: 'Hellelfenbein (S)', hex: '#F7F3E3' },
      { id: 'holzhell', label: 'Holz hell (S)', hex: '#F0DDB2' },
      { id: 'oregon', label: 'Oregon (S)', hex: '#E0E6DA' },
      { id: 'holzdunkel', label: 'Holz dunkel (S)', hex: '#BD8449' },
      { id: 'graubraun', label: 'Graubraun (S)', hex: '#9D5430' }
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
    'beige': '#E0D1C2',
    'weiss': '#F6F7F2',
    'grau': '#DFE3E0',
    'silber': '#B0B7B9',
    'altweiss': '#EBE9DA',
    'cremeweiss': '#F7F3E3',
    'hellelfenbein': '#F0DDB2',
    'holzhell': '#BD8449',
    'grauweiss': '#E0E6DA',
    'goldenoak': '#9D5430',
    'graubraun': '#362313',
    'anthrazitgrau': '#192C32',
    'eisenglimmer': '#2F3637',
    'moosgruen': '#15533D',
    'graualuminium': '#5D686D',
    'perlweiss': '#EEDFC4',
    'antikweiss': '#FFF9EA',
    'oregon': '#B25D42',
    'holzdunkel': '#936640'
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
    this.loadMeasurementVideo();
    this.calculatePrice();
    this.updateRollerImage();
    this.render();
    console.log('[RollerConfig] Ready', this.state);
  },

  buildEndleistColors() {
    const key = `${this.state.material}_${this.state.profile}`;
    const rollerColors = this.colorOptions[key] || [];
    
    this.endleistColors = {};
    rollerColors.forEach(color => {
      this.endleistColors[color.id] = {
        label: color.label,
        hex: color.hex,
        price: 0
      };
    });
    
    console.log('[RollerConfig] Built Endleiste colors:', Object.keys(this.endleistColors));
  },

  loadMeasurementVideo() {
    const videoElement = document.getElementById('measurement-video');
    if (videoElement) {
      const videoUrl = this.assetBaseUrl + 'measurement-guide.mp4';
      videoElement.querySelector('source').src = videoUrl;
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

    document.getElementById('height').addEventListener('change', () => this.onDimensionChange());
    document.getElementById('height').addEventListener('input', () => this.onDimensionChange());

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

    document.getElementById('add-to-cart-btn').addEventListener('click', () => this.addToCart());
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

    this.validateDimensions();
    this.calculateArea();
    this.calculatePrice();
    this.saveToStorage();
    this.render();

    console.log('[RollerConfig] Dimensions changed:', { width, height });
  },

  updateDimensionConstraints() {
    const key = `${this.state.material}_${this.state.profile}`;
    const constraint = this.constraints[key];

    if (constraint) {
      const widthInput = document.getElementById('width');
      const heightInput = document.getElementById('height');

      widthInput.min = constraint.width[0];
      widthInput.max = constraint.width[1];

      heightInput.min = constraint.height[0];
      heightInput.max = constraint.height[1];

      console.log('[RollerConfig] Updated constraints:', constraint);
    }
  },

  validateDimensions() {
    const key = `${this.state.material}_${this.state.profile}`;
    const constraint = this.constraints[key];
    const widthError = document.getElementById('width-error');
    const heightError = document.getElementById('height-error');

    widthError.textContent = '';
    heightError.textContent = '';

    if (constraint) {
      if (this.state.width < constraint.width[0] || this.state.width > constraint.width[1]) {
        widthError.textContent = `${constraint.width[0]}-${constraint.width[1]}mm erforderlich`;
      }
      if (this.state.height < constraint.height[0] || this.state.height > constraint.height[1]) {
        heightError.textContent = `${constraint.height[0]}-${constraint.height[1]}mm erforderlich`;
      }
    }
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
    const chargeableArea = Math.max(this.state.area, 1.0);
    const colorType = this.isSpecialColor(this.state.color) ? 'special' : 'standard';
    const key = `${this.state.material}_${this.state.profile}_${colorType}`;
    const pricePerM2 = this.priceTable[key] || 30;

    const basePrice = pricePerM2 * chargeableArea;
    const total = basePrice * this.state.quantity;

    this.state.minPrice = pricePerM2;
    this.state.totalPrice = total;

    console.log('[RollerConfig] Price calculated:', {
      area: this.state.area.toFixed(3),
      chargeableArea: chargeableArea.toFixed(3),
      colorType: colorType,
      pricePerM2: pricePerM2,
      basePrice: basePrice.toFixed(2),
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

    colors.forEach(color => {
      const label = document.createElement('label');
      label.className = 'color-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'color';
      input.value = color.id;
      input.checked = color.id === this.state.color;

      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color.hex;

      const span = document.createElement('span');
      span.textContent = color.label;

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

      label.appendChild(input);
      label.appendChild(swatch);
      label.appendChild(span);
      container.appendChild(label);
    });
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
      swatch.style.backgroundColor = color.hex;

      const span = document.createElement('span');
      span.textContent = color.label;

      input.addEventListener('change', () => {
        this.state.endleiste.color = key;
        this.saveToStorage();
        this.render();
        console.log('[RollerConfig] Endleiste color changed to:', key);
      });

      label.appendChild(input);
      label.appendChild(swatch);
      label.appendChild(span);
      container.appendChild(label);
    });
  },

  updateRollerImage() {
    const filename = `roller-${this.state.profile}-${this.state.color}.png`;
    const imageUrl = this.assetBaseUrl + filename;
    document.getElementById('roller-image').src = imageUrl;
    console.log('[RollerConfig] Updated image to:', imageUrl);
  },

  render() {
    document.getElementById('area-display').textContent = this.state.area.toFixed(3);
    document.getElementById('total-price').textContent = this.state.totalPrice.toFixed(2);

    const minWarning = document.getElementById('minimum-warning');
    if (this.state.area > 0 && this.state.area < 1.0) {
      minWarning.classList.add('active');
    } else {
      minWarning.classList.remove('active');
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

    if (this.state.width <= 0 || this.state.height <= 0) {
      alert('Bitte geben Sie gültige Abmessungen ein');
      return;
    }

    const variantId = this.getVariantId();
    console.log('[RollerConfig] Using variant:', variantId);

    const key = `${this.state.material}_${this.state.profile}`;
    const colorObj = this.colorOptions[key]?.find(c => c.id === this.state.color);
    const colorLabel = colorObj?.label || this.state.color;

    let endleistColorLabel = this.state.endleiste.color;
    if (this.state.endleiste.color === 'match') {
      endleistColorLabel = colorLabel + ' (Abgestimmt)';
    } else if (this.endleistColors[this.state.endleiste.color]) {
      endleistColorLabel = this.endleistColors[this.state.endleiste.color].label;
    }

    const cartItem = {
      variantId: variantId,
      quantity: this.state.quantity,
      properties: {
        'Width (mm)': this.state.width,
        'Height (mm)': this.state.height,
        'Material': this.state.material === 'alu' ? 'Aluminium' : 'PVC',
        'Profile': this.state.profile === 'mini' ? 'Mini (37mm)' : 'Maxi (52mm)',
        'Color': colorLabel,
        'Area (m2)': this.state.area.toFixed(3),
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      console.log('[RollerConfig] Cart response:', data);
      window.location.href = '/cart';
    })
    .catch(error => {
      console.error('[RollerConfig] Cart error:', error);
      alert('Fehler beim Hinzufügen zum Warenkorb. Bitte versuchen Sie es erneut.');
    });
  }
};

window.RegistrationForm = {
  countryFields: {
    de: {
      label: 'Deutschland',
      fields: [
        { id: 'street', label: 'Straße', type: 'text', placeholder: 'z.B. Hauptstraße 123' },
        { id: 'postal-code', label: 'Postleitzahl (PLZ)', type: 'text', placeholder: 'z.B. 10115', pattern: '^[0-9]{5}$' },
        { id: 'city', label: 'Stadt', type: 'text', placeholder: 'z.B. Berlin' }
      ]
    },
    at: {
      label: 'Österreich',
      fields: [
        { id: 'street', label: 'Straße', type: 'text', placeholder: 'z.B. Hauptstraße 123' },
        { id: 'postal-code', label: 'Postleitzahl (PLZ)', type: 'text', placeholder: 'z.B. 1010', pattern: '^[0-9]{4}$' },
        { id: 'city', label: 'Stadt', type: 'text', placeholder: 'z.B. Wien' }
      ]
    },
    ch: {
      label: 'Schweiz',
      fields: [
        { id: 'street', label: 'Straße', type: 'text', placeholder: 'z.B. Hauptstraße 123' },
        { id: 'postal-code', label: 'Postleitzahl (PLZ)', type: 'text', placeholder: 'z.B. 8000', pattern: '^[0-9]{4}$' },
        { id: 'city', label: 'Ort', type: 'text', placeholder: 'z.B. Zürich' }
      ]
    },
    li: {
      label: 'Liechtenstein',
      fields: [
        { id: 'street', label: 'Straße', type: 'text', placeholder: 'z.B. Hauptstraße 123' },
        { id: 'postal-code', label: 'Postleitzahl (PLZ)', type: 'text', placeholder: 'z.B. 9490', pattern: '^[0-9]{4}$' },
        { id: 'city', label: 'Ort', type: 'text', placeholder: 'z.B. Schaan' }
      ]
    }
  },

  init() {
    const toggle = document.querySelector('.registration-toggle');
    const countrySelect = document.getElementById('customer-country');
    
    if (toggle) {
      toggle.addEventListener('click', () => this.toggleForm());
    }
    
    if (countrySelect) {
      countrySelect.addEventListener('change', () => this.renderAddressFields());
    }
  },

  toggleForm() {
    const container = document.getElementById('registration-form-container');
    const toggle = document.querySelector('.registration-toggle');
    
    if (container.style.display === 'none') {
      container.style.display = 'block';
      toggle.classList.add('active');
    } else {
      container.style.display = 'none';
      toggle.classList.remove('active');
    }
  },

  renderAddressFields() {
    const country = document.getElementById('customer-country').value;
    const addressFieldsContainer = document.getElementById('address-fields');
    
    if (!country) {
      addressFieldsContainer.innerHTML = '';
      return;
    }
    
    const countryConfig = this.countryFields[country];
    let html = '';
    
    countryConfig.fields.forEach(field => {
      html += `
        <div class="form-group">
          <label for="${field.id}">${field.label}</label>
          <input 
            type="${field.type}" 
            id="${field.id}" 
            name="${field.id}" 
            placeholder="${field.placeholder}"
            ${field.pattern ? `pattern="${field.pattern}"` : ''}
            required>
        </div>
      `;
    });
    
    addressFieldsContainer.innerHTML = html;
  },

  getFormData() {
    const country = document.getElementById('customer-country').value;
    if (!country) return null;
    
    const data = {
      country: country,
      company: document.getElementById('company-name').value,
      contact: document.getElementById('contact-person').value,
      email: document.getElementById('customer-email').value,
      phone: document.getElementById('customer-phone').value,
      projectCode: document.getElementById('project-code').value
    };
    
    const countryConfig = this.countryFields[country];
    countryConfig.fields.forEach(field => {
      data[field.id] = document.getElementById(field.id).value;
    });
    
    return data;
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
  RegistrationForm.init();
  MeasurementInstructions.init();
});
