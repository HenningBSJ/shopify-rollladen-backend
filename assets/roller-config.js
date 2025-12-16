window.RollerConfig = {
  state: {
    material: 'alu',
    profile: 'mini',
    width: 0,
    height: 0,
    color: 'standard',
    area: 0,
    minPrice: 0,
    totalPrice: 0,

    endleiste: {
      enabled: false,
      color: 'silber_eloxiert',
      holes: true,
      price: 0
    }
  },

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
    standard: [
      { id: 'standard', label: 'Standard', hex: '#999999' }
    ],
    special: [
      { id: 'special_white', label: 'Weiß (RAL 9016)', hex: '#f5f5f5' },
      { id: 'special_black', label: 'Schwarz (RAL 9005)', hex: '#1a1a1a' },
      { id: 'special_brown', label: 'Braun (RAL 8014)', hex: '#4a3728' },
      { id: 'special_silver', label: 'Silber (RAL 9006)', hex: '#e8e8e8' },
      { id: 'special_beige', label: 'Beige (RAL 1015)', hex: '#e8dcc8' },
      { id: 'special_custom', label: 'Eigene Farbe', hex: '#0066cc' }
    ]
  },

  endleistColors: {
    silber_eloxiert: { label: 'Silber eloxiert', hex: '#c0c0c0', price: 0 },
    match: { label: 'Abgestimmt auf Rollladen', hex: 'transparent', price: 0 },
    custom: { label: 'Eigene Farbe', hex: '#0066cc', price: 0 }
  },

  init() {
    console.log('[RollerConfig] Initializing...');
    this.loadFromStorage();
    this.renderColorOptions();
    this.renderEndleistColorOptions();
    this.attachEventListeners();
    this.calculatePrice();
    this.render();
    console.log('[RollerConfig] Ready', this.state);
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

    document.getElementById('endleiste-enabled').addEventListener('change', () => this.toggleEndleiste());

    document.getElementById('add-to-cart-btn').addEventListener('click', () => this.addToCart());
  },

  onMaterialChange() {
    const material = document.querySelector('input[name="material"]:checked').value;
    this.state.material = material;

    this.updateDimensionConstraints();
    this.renderColorOptions();
    this.calculatePrice();
    this.saveToStorage();
    this.render();

    console.log('[RollerConfig] Material changed to:', material);
  },

  onProfileChange() {
    const profile = document.querySelector('input[name="profile"]:checked').value;
    this.state.profile = profile;

    this.updateDimensionConstraints();
    this.calculatePrice();
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

  calculatePrice() {
    const chargeableArea = Math.max(this.state.area, 1.0);
    const key = `${this.state.material}_${this.state.profile}_${this.state.color}`;
    const pricePerM2 = this.priceTable[key] || 30;

    const basePrice = pricePerM2 * chargeableArea;

    let total = basePrice;

    if (this.state.endleiste.enabled) {
      const endleistPrice = 12.50;
      total += endleistPrice;
      this.state.endleiste.price = endleistPrice;
    } else {
      this.state.endleiste.price = 0;
    }

    this.state.minPrice = pricePerM2;
    this.state.totalPrice = total;

    console.log('[RollerConfig] Price calculated:', {
      area: this.state.area.toFixed(3),
      chargeableArea: chargeableArea.toFixed(3),
      pricePerM2: pricePerM2,
      basePrice: basePrice.toFixed(2),
      endleiste: this.state.endleiste.price.toFixed(2),
      total: total.toFixed(2)
    });
  },

  toggleEndleiste() {
    const enabled = document.getElementById('endleiste-enabled').checked;
    this.state.endleiste.enabled = enabled;

    const endleistOptions = document.getElementById('endleiste-options');
    if (enabled) {
      endleistOptions.classList.add('active');
    } else {
      endleistOptions.classList.remove('active');
    }

    this.calculatePrice();
    this.saveToStorage();
    this.render();

    console.log('[RollerConfig] Endleiste toggled:', enabled);
  },

  renderColorOptions() {
    const container = document.getElementById('color-options');
    container.innerHTML = '';

    const hasSpecial = this.state.material === 'alu'; // Only Alu has special colors
    const colors = hasSpecial 
      ? [...this.colorOptions.standard, ...this.colorOptions.special]
      : this.colorOptions.standard;

    colors.forEach(color => {
      const label = document.createElement('label');
      label.className = 'color-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'color';
      input.value = color.id.startsWith('special') ? 'special' : 'standard';
      input.checked = input.value === this.state.color;

      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color.hex;

      const span = document.createElement('span');
      span.textContent = color.label;

      input.addEventListener('change', () => {
        this.state.color = input.value;
        this.calculatePrice();
        this.saveToStorage();
        this.render();
        console.log('[RollerConfig] Color changed to:', input.value);
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
      swatch.style.backgroundColor = key === 'match' ? '#999' : color.hex;

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

        if (this.state.endleiste.enabled) {
          document.getElementById('endleiste-enabled').checked = true;
          document.getElementById('endleiste-options').classList.add('active');
          document.getElementById('endleiste-holes').checked = this.state.endleiste.holes;
        }

        console.log('[RollerConfig] Loaded from storage:', this.state);
      }
    } catch (e) {
      console.warn('[RollerConfig] localStorage load failed:', e);
    }
  },

  getVariantId() {
    const key = `${this.state.material}_${this.state.profile}_${this.state.color}`;
    const variantMap = {
      'alu_mini_standard': 'ROLLER-ALU-MINI-STD',
      'alu_mini_special': 'ROLLER-ALU-MINI-SPL',
      'alu_maxi_standard': 'ROLLER-ALU-MAXI-STD',
      'alu_maxi_special': 'ROLLER-ALU-MAXI-SPL',
      'pvc_mini_standard': 'ROLLER-PVC-MINI-STD',
      'pvc_mini_special': 'ROLLER-PVC-MINI-SPL',
      'pvc_maxi_standard': 'ROLLER-PVC-MAXI-STD',
      'pvc_maxi_special': 'ROLLER-PVC-MAXI-SPL'
    };
    return variantMap[key];
  },

  addToCart() {
    console.log('[RollerConfig] Adding to cart...');

    if (this.state.width <= 0 || this.state.height <= 0) {
      alert('Bitte geben Sie gültige Abmessungen ein');
      return;
    }

    const variantId = this.getVariantId();
    console.log('[RollerConfig] Using variant:', variantId);

    const cartItem = {
      variantId: variantId,
      quantity: 1,
      properties: {
        'Width (mm)': this.state.width,
        'Height (mm)': this.state.height,
        'Material': this.state.material === 'alu' ? 'Aluminium' : 'PVC',
        'Profile': this.state.profile === 'mini' ? 'Mini (37mm)' : 'Maxi (52mm)',
        'Color': this.state.color === 'standard' ? 'Standard' : 'Special',
        'Area (m2)': this.state.area.toFixed(3),
        'Endleiste_Enabled': this.state.endleiste.enabled ? 'Yes' : 'No',
        'Endleiste_Color': this.state.endleiste.color,
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

document.addEventListener('DOMContentLoaded', () => {
  RollerConfig.init();
});
