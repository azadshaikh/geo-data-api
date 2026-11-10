class PerformanceMonitor {
  constructor() {
    this.timers = new Map();
    this.counters = new Map();
    this.startTime = Date.now();
  }

  startTimer(name) {
    this.timers.set(name, {
      start: Date.now(),
      end: null,
      duration: null,
    });
  }

  endTimer(name) {
    const timer = this.timers.get(name);
    if (timer) {
      timer.end = Date.now();
      timer.duration = timer.end - timer.start;
    }
    return timer?.duration || 0;
  }

  getTimer(name) {
    return this.timers.get(name);
  }

  increment(name, value = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  getCounter(name) {
    return this.counters.get(name) || 0;
  }

  getTotalDuration() {
    return Date.now() - this.startTime;
  }

  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(2);
      return `${minutes}m ${seconds}s`;
    }
  }

  generateReport() {
    const totalDuration = this.getTotalDuration();
    const report = {
      totalDuration: this.formatDuration(totalDuration),
      totalDurationMs: totalDuration,
      timers: {},
      counters: {},
    };

    // Process timers
    for (const [name, timer] of this.timers) {
      if (timer.duration !== null) {
        report.timers[name] = {
          duration: this.formatDuration(timer.duration),
          durationMs: timer.duration,
          percentage: ((timer.duration / totalDuration) * 100).toFixed(1) + "%",
        };
      }
    }

    // Process counters
    for (const [name, count] of this.counters) {
      report.counters[name] = count;
    }

    return report;
  }

  printReport() {
    const report = this.generateReport();

    console.log("\n🏁 Performance Report");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Total Duration: ${report.totalDuration}`);

    if (Object.keys(report.timers).length > 0) {
      console.log("\nTimers:");
      for (const [name, data] of Object.entries(report.timers)) {
        console.log(`  ${name}: ${data.duration} (${data.percentage})`);
      }
    }

    if (Object.keys(report.counters).length > 0) {
      console.log("\nCounters:");
      for (const [name, count] of Object.entries(report.counters)) {
        console.log(`  ${name}: ${count.toLocaleString("en-US")}`);
      }
    }

    // Calculate throughput if we have file counters
    const filesGenerated = this.getCounter("files_generated");
    if (filesGenerated > 0) {
      const throughput = (
        filesGenerated /
        (report.totalDurationMs / 1000)
      ).toFixed(1);
      console.log(`\nThroughput: ${throughput} files/sec`);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }

  // Helper method for measuring async functions
  async measure(name, asyncFunction) {
    this.startTimer(name);
    try {
      const result = await asyncFunction();
      return result;
    } finally {
      this.endTimer(name);
    }
  }

  // Helper method for measuring and counting
  async measureAndCount(timerName, counterName, asyncFunction) {
    this.startTimer(timerName);
    try {
      const result = await asyncFunction();
      // If result is an array, count its length; otherwise count as 1
      const count = Array.isArray(result) ? result.length : 1;
      this.increment(counterName, count);
      return result;
    } finally {
      this.endTimer(timerName);
    }
  }
}

module.exports = PerformanceMonitor;
