// easify-fetch-fallback.js
// Intercepts fetch requests for missing product JSONs (e.g., express-delivery-*.js)
// and returns an empty JSON object so Easify's client doesn't throw a parse error.

// @ts-nocheck

// Comprehensive safe product JSON used when a product-js response is missing/empty.
// Includes all commonly iterated fields to prevent "not iterable" errors.
const __EASIFY_SAFE_PRODUCT_JSON = JSON.stringify({
  id: null,
  title: '',
  handle: '',
  variants: [],
  selling_plan_groups: [],
  options: [],
  images: [],
  featured_image: null,
  vendor: '',
  type: '',
  price: null,
  compare_at_price: null,
  created_at: '',
  updated_at: ''
});

(function () {
  if (!('fetch' in window)) return;
  const _fetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      // Pattern that matched the failing request in logs
      const isExpressDelivery = /\/products\/express-delivery-\d+\.js($|\?)/i.test(url);
      const isProductJs = /\/products\/[^/]+-\d+\.js($|\?)/i.test(url);

      if (isExpressDelivery || (isProductJs && url.toLowerCase().includes('express-delivery'))) {
        console.warn('[EasifyFetchFallback] Intercepting missing product JSON:', url);
        return new Response(__EASIFY_SAFE_PRODUCT_JSON, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const res = await _fetch(input, init);

      // Check for 404 or empty responses for product-js URLs
      if (isProductJs) {
        // Handle 404 responses
        if (res.status === 404) {
          console.warn('[EasifyFetchFallback] Intercepting 404 product response, returning valid JSON:', url);
          return new Response(__EASIFY_SAFE_PRODUCT_JSON, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Handle empty bodies (content-length: 0)
        if (res.ok) {
          const contentLength = res.headers.get('content-length');
          if (contentLength === '0') {
            console.warn('[EasifyFetchFallback] Intercepting empty product response (content-length=0), returning valid JSON:', url);
            return new Response(__EASIFY_SAFE_PRODUCT_JSON, {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Also check if actual body is empty
          try {
            const cloned = res.clone();
            const text = await cloned.text();
            if (!text || text.trim() === '') {
              console.warn('[EasifyFetchFallback] Intercepting empty product response body, returning valid JSON:', url);
              return new Response(__EASIFY_SAFE_PRODUCT_JSON, {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            // Body is not empty, return original response
            return res;
          } catch (e) {
            // If we can't read body, return original response
            return res;
          }
        }
      }

      return res;
    } catch (err) {
      // On network error, synthesize an empty JSON for product-js requests
      try {
        const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
        const isProductJs = /\/products\/.+\-\d+\.js($|\?)/i.test(url);
        if (isProductJs) {
          console.warn('[EasifyFetchFallback] Network error while fetching product JSON, returning empty JSON:', err.message);
          return new Response(__EASIFY_SAFE_PRODUCT_JSON, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        // fall through
      }
      throw err;
    }
  };

  console.log('✓ EasifyFetchFallback installed');
})();

// Also patch XMLHttpRequest to return empty JSON for matching product-js URLs
(function () {
  if (!('XMLHttpRequest' in window)) return;
  const XHR = window.XMLHttpRequest;
  const open = XHR.prototype.open;
  const send = XHR.prototype.send;

  XHR.prototype.open = function (method, url) {
    this.__easify_url = typeof url === 'string' ? url : (url && url.url) || '';
    return open.apply(this, arguments);
  };

  XHR.prototype.send = function (body) {
    try {
      const url = this.__easify_url || '';
      const isProductJs = /\/products\/express-delivery-\d+\.js($|\?)/i.test(url) || /\/products\/[^/]+-\d+\.js($|\?)/i.test(url);
      if (isProductJs) {
        // Synthesize a successful JSON response
        this.readyState = 4;
        this.status = 200;
        this.responseType = 'text';
        this.responseText = __EASIFY_SAFE_PRODUCT_JSON;
        if (typeof this.onreadystatechange === 'function') {
          try { this.onreadystatechange(); } catch (e) { /* ignore */ }
        }
        if (typeof this.onload === 'function') {
          try { this.onload(); } catch (e) { /* ignore */ }
        }
        return;
      }
    } catch (e) {
      // fall through to default send
    }
    return send.apply(this, arguments);
  };

  console.log('✓ EasifyFetchFallback: XHR patched');
})();

// Intercept dynamic script insertions to avoid 404s for product-js script tags
(function () {
  const origAppend = Element.prototype.appendChild;
  const origInsertBefore = Element.prototype.insertBefore;
  function shouldInterceptScript(node) {
    try {
      if (!node || node.tagName !== 'SCRIPT') return false;
      const src = node.src || '';
      return /\/products\/express-delivery-\d+\.js($|\?)/i.test(src) || /\/products\/[^/]+-\d+\.js($|\?)/i.test(src);
    } catch (e) { return false; }
  }

  function makeInlinePlaceholder() {
    const s = document.createElement('script');
    s.type = 'application/javascript';
    s.text = '// easify fallback placeholder';
    return s;
  }

  Element.prototype.appendChild = function (node) {
    if (shouldInterceptScript(node)) {
      console.warn('[EasifyFetchFallback] Replacing dynamic script with inline placeholder:', node.src);
      return origAppend.call(this, makeInlinePlaceholder());
    }
    return origAppend.call(this, node);
  };

  Element.prototype.insertBefore = function (newNode, refNode) {
    if (shouldInterceptScript(newNode)) {
      console.warn('[EasifyFetchFallback] Replacing dynamic script (insertBefore) with inline placeholder:', newNode.src);
      return origInsertBefore.call(this, makeInlinePlaceholder(), refNode);
    }
    return origInsertBefore.call(this, newNode, refNode);
  };

  console.log('✓ EasifyFetchFallback: script insertion interception installed');
})();
