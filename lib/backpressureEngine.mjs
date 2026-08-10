/**
 * Priority-Based Backpressure Engine
 * Prioritizes bet placement, score updates, and settlement over background analytics and notifications.
 */

class BackpressureEngine {
  constructor() {
    this.highPriorityQueue = []; // Priority 1: Bet Placement, Score Updates
    this.mediumPriorityQueue = []; // Priority 2: Odds Updates, Market Updates
    this.lowPriorityQueue = []; // Priority 3: Analytics, Notifications
    this.maxQueueDepth = 1000;
  }

  enqueue(priorityLevel = 2, taskFn) {
    if (typeof taskFn !== 'function') return false;

    if (priorityLevel === 1) {
      this.highPriorityQueue.push(taskFn);
    } else if (priorityLevel === 2) {
      if (this.mediumPriorityQueue.length < this.maxQueueDepth) {
        this.mediumPriorityQueue.push(taskFn);
      }
    } else {
      // Shed low-priority load if queues are backed up
      if (this.lowPriorityQueue.length < 200 && this.highPriorityQueue.length < 500) {
        this.lowPriorityQueue.push(taskFn);
      }
    }

    return true;
  }

  processNext() {
    if (this.highPriorityQueue.length > 0) {
      const task = this.highPriorityQueue.shift();
      return task();
    }
    if (this.mediumPriorityQueue.length > 0) {
      const task = this.mediumPriorityQueue.shift();
      return task();
    }
    if (this.lowPriorityQueue.length > 0) {
      const task = this.lowPriorityQueue.shift();
      return task();
    }
    return null;
  }

  getQueueStatus() {
    return {
      highPriorityCount: this.highPriorityQueue.length,
      mediumPriorityCount: this.mediumPriorityQueue.length,
      lowPriorityCount: this.lowPriorityQueue.length,
    };
  }
}

export const backpressureEngine = new BackpressureEngine();
