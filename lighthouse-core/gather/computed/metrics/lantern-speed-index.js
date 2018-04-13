/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const MetricArtifact = require('./lantern-metric');
const Node = require('../../../lib/dependency-graph/node');
const CPUNode = require('../../../lib/dependency-graph/cpu-node'); // eslint-disable-line no-unused-vars

class SpeedIndex extends MetricArtifact {
  get name() {
    return 'LanternSpeedIndex';
  }

  /**
   * @return {LH.Gatherer.Simulation.MetricCoefficients}
   */
  get COEFFICIENTS() {
    return {
      intercept: 200,
      optimistic: 1.16,
      pessimistic: 0.57,
    };
  }

  /**
   * @param {Node} dependencyGraph
   * @return {Node}
   */
  getOptimisticGraph(dependencyGraph) {
    return dependencyGraph;
  }

  /**
   * @param {Node} dependencyGraph
   * @return {Node}
   */
  getPessimisticGraph(dependencyGraph) {
    return dependencyGraph;
  }

  /**
   * @param {LH.Gatherer.Simulation.Result} simulationResult
   * @param {Object} extras
   * @return {LH.Gatherer.Simulation.Result}
   */
  getEstimateFromSimulation(simulationResult, extras) {
    const fcpTimeInMs = extras.fcpResult.timing;
    const estimate = extras.optimistic
      ? extras.speedline.perceptualSpeedIndex
      : SpeedIndex.computeLayoutBasedSpeedIndex(simulationResult.nodeTiming, fcpTimeInMs);
    return {
      timeInMs: estimate,
      nodeTiming: simulationResult.nodeTiming,
    };
  }

  /**
   * @param {LH.Artifacts.MetricComputationData} data
   * @param {Object} artifacts
   * @return {Promise<LH.Artifacts.LanternMetric>}
   */
  async compute_(data, artifacts) {
    const speedline = await artifacts.requestSpeedline(data.trace);
    const fcpResult = await artifacts.requestLanternFirstContentfulPaint(data, artifacts);
    const metricResult = await this.computeMetricWithGraphs(data, artifacts, {speedline, fcpResult});
    metricResult.timing = Math.max(metricResult.timing, fcpResult.timing);
    return metricResult;
  }

  /**
   * @param {Map<Node, LH.Gatherer.Simulation.NodeTiming>} nodeTiming
   * @param {number} fcpTimeInMs
   * @return {number}
   */
  static computeLayoutBasedSpeedIndex(nodeTiming, fcpTimeInMs) {
    /** @type {Array<{time: number, weight: number}>} */
    const layoutWeights = [];
    for (const [node, timing] of nodeTiming.entries()) {
      if (node.type !== Node.TYPES.CPU) continue;
      if (!timing.startTime || !timing.endTime) continue;

      const cpuNode = /** @type {CPUNode} */ (node);
      if (cpuNode.childEvents.some(x => x.name === 'Layout')) {
        const timingWeight = Math.max(Math.log2(timing.endTime - timing.startTime), 0);
        layoutWeights.push({time: timing.endTime, weight: timingWeight});
      }
    }

    if (!layoutWeights.length) {
      return fcpTimeInMs;
    }

    const totalWeightedTime = layoutWeights
      .map(evt => evt.weight * Math.max(evt.time, fcpTimeInMs))
      .reduce((a, b) => a + b, 0);
    const totalWeight = layoutWeights
      .map(evt => evt.weight)
      .reduce((a, b) => a + b, 0);
    return totalWeightedTime / totalWeight;
  }
}

module.exports = SpeedIndex;
