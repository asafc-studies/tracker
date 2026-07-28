export {};

declare global {
  interface BarcodeDetectorOptions {
    formats?: string[];
  }

  class BarcodeDetector {
    constructor(options?: BarcodeDetectorOptions);
    static getSupportedFormats(): Promise<string[]>;
    detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
  }

  interface Window {
    BarcodeDetector?: typeof BarcodeDetector;
  }
}
