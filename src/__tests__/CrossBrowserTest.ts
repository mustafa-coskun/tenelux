/**
 * CrossBrowserTest validates game functionality across different browsers and devices
 */
export class CrossBrowserTest {
  private testResults: Map<string, { passed: number; failed: number; errors: string[] }> = new Map();

  /**
   * Test WebSocket compatibility across browsers
   */
  testWebSocketCompatibility(): boolean {
    const testName = 'WebSocket Compatibility';
    this.initTestResult(testName);

    try {
      // Test WebSocket constructor
      if (typeof WebSocket === 'undefined') {
        this.addError(testName, 'WebSocket not supported');
        return false;
      }

      // Test WebSocket states
      const requiredStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
      for (const state of requiredStates) {
        if (!(state in WebSocket)) {
          this.addError(testName, `WebSocket.${state} not available`);
          return false;
        }
      }

      // Test WebSocket events
      const ws = new WebSocket('ws://localhost:3001');
      const requiredEvents = ['onopen', 'onmessage', 'onerror', 'onclose'];
      for (const event of requiredEvents) {
        if (!(event in ws)) {
          this.addError(testName, `WebSocket.${event} not available`);
          ws.close();
          return false;
        }
      }

      ws.close();
      this.addPass(testName);
      return true;
    } catch (error) {
      this.addError(testName, `WebSocket test failed: ${error}`);
      return false;
    }
  }

  /**
   * Test Web Audio API compatibility
   */
  testWebAudioCompatibility(): boolean {
    const testName = 'Web Audio API Compatibility';
    this.initTestResult(testName);

    try {
      // Test AudioContext
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        this.addError(testName, 'AudioContext not supported');
        return false;
      }

      const audioContext = new AudioContext();
      
      // Test required methods
      const requiredMethods = ['createOscillator', 'createGain', 'createBuffer'];
      for (const method of requiredMethods) {
        if (typeof audioContext[method] !== 'function') {
          this.addError(testName, `AudioContext.${method} not available`);
          return false;
        }
      }

      audioContext.close();
      this.addPass(testName);
      return true;
    } catch (error) {
      this.addError(testName, `Web Audio API test failed: ${error}`);
      return false;
    }
  }

  /**
   * Test localStorage compatibility
   */
  testLocalStorageCompatibility(): boolean {
    const testName = 'localStorage Compatibility';
    this.initTestResult(testName);

    try {
      if (typeof Storage === 'undefined' || !window.localStorage) {
        this.addError(testName, 'localStorage not supported');
        return false;
      }

      // Test basic operations
      const testKey = 'tenebris_test_key';
      const testValue = 'test_value';

      localStorage.setItem(testKey, testValue);
      const retrievedValue = localStorage.getItem(testKey);
      
      if (retrievedValue !== testValue) {
        this.addError(testName, 'localStorage set/get failed');
        return false;
      }

      localStorage.removeItem(testKey);
      
      if (localStorage.getItem(testKey) !== null) {
        this.addError(testName, 'localStorage remove failed');
        return false;
      }

      this.addPass(testName);
      return true;
    } catch (error) {
      this.addError(testName, `localStorage test failed: ${error}`);
      return false;
    }
  }

  /**
   * Test CSS features compatibility
   */
  testCSSCompatibility(): boolean {
    const testName = 'CSS Features Compatibility';
    this.initTestResult(testName);

    try {
      const testElement = document.createElement('div');
      document.body.appendChild(testElement);

      // Test CSS Grid
      testElement.style.display = 'grid';
      if (getComputedStyle(testElement).display !== 'grid') {
        this.addError(testName, 'CSS Grid not supported');
      } else {
        this.addPass(testName);
      }

      // Test CSS Flexbox
      testElement.style.display = 'flex';
      if (getComputedStyle(testElement).display !== 'flex') {
        this.addError(testName, 'CSS Flexbox not supported');
      } else {
        this.addPass(testName);
      }

      // Test CSS Custom Properties (Variables)
      testElement.style.setProperty('--test-var', 'red');
      testElement.style.color = 'var(--test-var)';
      
      if (!CSS.supports('color', 'var(--test-var)')) {
        this.addError(testName, 'CSS Custom Properties not supported');
      } else {
        this.addPass(testName);
      }

      // Test CSS Animations
      if (!CSS.supports('animation', 'test 1s')) {
        this.addError(testName, 'CSS Animations not supported');
      } else {
        this.addPass(testName);
      }

      document.body.removeChild(testElement);
      return this.getTestResult(testName).failed === 0;
    } catch (error) {
      this.addError(testName, `CSS compatibility test failed: ${error}`);
      return false;
    }
  }

  /**
   * Test JavaScript ES6+ features
   */
  testJavaScriptCompatibility(): boolean {
    const testName = 'JavaScript ES6+ Compatibility';
    this.initTestResult(testName);

    try {
      // Test Arrow Functions
      const arrowFunc = () => 'test';
      if (arrowFunc() !== 'test') {
        this.addError(testName, 'Arrow functions not working');
      } else {
        this.addPass(testName);
      }

      // Test Template Literals
      const name = 'test';
      const template = `Hello ${name}`;
      if (template !== 'Hello test') {
        this.addError(testName, 'Template literals not working');
      } else {
        this.addPass(testName);
      }

      // Test Destructuring
      const obj = { a: 1, b: 2 };
      const { a, b } = obj;
      if (a !== 1 || b !== 2) {
        this.addError(testName, 'Destructuring not working');
      } else {
        this.addPass(testName);
      }

      // Test Promises
      if (typeof Promise === 'undefined') {
        this.addError(testName, 'Promises not supported');
      } else {
        this.addPass(testName);
      }

      // Test async/await
      try {
        eval('(async () => {})');
        this.addPass(testName);
      } catch {
        this.addError(testName, 'async/await not supported');
      }

      // Test Map and Set
      if (typeof Map === 'undefined' || typeof Set === 'undefined') {
        this.addError(testName, 'Map/Set not supported');
      } else {
        this.addPass(testName);
      }

      return this.getTestResult(testName).failed === 0;
    } catch (error) {
      this.addError(testName, `JavaScript compatibility test failed: ${error}`);
      return false;
    }
  }

  /**
   * Test responsive design features
   */
  testResponsiveDesign(): boolean {
    const testName = 'Responsive Design';
    this.initTestResult(testName);

    try {
      // Test viewport meta tag
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (!viewportMeta) {
        this.addError(testName, 'Viewport meta tag missing');
      } else {
        this.addPass(testName);
      }

      // Test media queries
      if (!window.matchMedia) {
        this.addError(testName, 'matchMedia not supported');
      } else {
        const mq = window.matchMedia('(max-width: 768px)');
        if (typeof mq.matches !== 'boolean') {
          this.addError(testName, 'matchMedia not working properly');
        } else {
          this.addPass(testName);
        }
      }

      // Test touch events (for mobile)
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        this.addPass(testName);
      }

      return this.getTestResult(testName).failed === 0;
    } catch (error) {
      this.addError(testName, `Responsive design test failed: ${error}`);
      return false;
    }
  }

  /**
   * Test performance APIs
   */
  testPerformanceAPIs(): boolean {
    const testName = 'Performance APIs';
    this.initTestResult(testName);

    try {
      // Test Performance API
      if (!window.performance) {
        this.addError(testName, 'Performance API not supported');
      } else {
        if (typeof performance.now !== 'function') {
          this.addError(testName, 'performance.now() not available');
        } else {
          this.addPass(testName);
        }
      }

      // Test requestAnimationFrame
      if (typeof requestAnimationFrame !== 'function') {
        this.addError(testName, 'requestAnimationFrame not supported');
      } else {
        this.addPass(testName);
      }

      return this.getTestResult(testName).failed === 0;
    } catch (error) {
      this.addError(testName, `Performance APIs test failed: ${error}`);
      return false;
    }
  }

  /**
   * Run all compatibility tests
   */
  runAllTests(): { passed: boolean; summary: string; details: any } {
    console.log('🌐 Running cross-browser compatibility tests...');

    const tests = [
      () => this.testWebSocketCompatibility(),
      () => this.testWebAudioCompatibility(),
      () => this.testLocalStorageCompatibility(),
      () => this.testCSSCompatibility(),
      () => this.testJavaScriptCompatibility(),
      () => this.testResponsiveDesign(),
      () => this.testPerformanceAPIs()
    ];

    let totalPassed = 0;
    let totalFailed = 0;

    for (const test of tests) {
      try {
        test();
      } catch (error) {
        console.error('Test execution error:', error);
      }
    }

    // Calculate totals
    for (const result of this.testResults.values()) {
      totalPassed += result.passed;
      totalFailed += result.failed;
    }

    const allPassed = totalFailed === 0;
    const summary = `${totalPassed} passed, ${totalFailed} failed`;

    console.log(allPassed ? '✅' : '❌', `Compatibility tests: ${summary}`);

    return {
      passed: allPassed,
      summary,
      details: Object.fromEntries(this.testResults)
    };
  }

  /**
   * Get browser information
   */
  getBrowserInfo(): {
    userAgent: string;
    platform: string;
    language: string;
    cookieEnabled: boolean;
    onLine: boolean;
    screenResolution: string;
    colorDepth: number;
    pixelRatio: number;
  } {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1
    };
  }

  /**
   * Initialize test result tracking
   */
  private initTestResult(testName: string): void {
    if (!this.testResults.has(testName)) {
      this.testResults.set(testName, { passed: 0, failed: 0, errors: [] });
    }
  }

  /**
   * Add a passing test
   */
  private addPass(testName: string): void {
    const result = this.testResults.get(testName)!;
    result.passed++;
  }

  /**
   * Add a failing test with error message
   */
  private addError(testName: string, error: string): void {
    const result = this.testResults.get(testName)!;
    result.failed++;
    result.errors.push(error);
  }

  /**
   * Get test result for a specific test
   */
  private getTestResult(testName: string) {
    return this.testResults.get(testName)!;
  }
}

export default CrossBrowserTest;