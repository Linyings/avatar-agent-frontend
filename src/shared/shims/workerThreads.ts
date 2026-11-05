export class Worker {
  constructor() {
    throw new Error('worker_threads 仅可在 Node.js 环境中使用')
  }
}
