declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(type: string, data: Float32Array, dims: number[]);
    data: Float32Array | number[];
    dims: number[];
  }
  export class InferenceSession {
    static create(path: string): Promise<InferenceSession>;
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }
}
