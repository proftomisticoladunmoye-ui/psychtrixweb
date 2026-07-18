/**
 * Network analysis worker — runs the full estimation pipeline (EBICglasso/
 * Ising, centrality, community detection, bootstrap stability) off the main
 * thread so the UI never freezes, posting progress along the way.
 */
import { ebicGlasso, estimateIsingModel, EBICglassoResult, IsingResult } from '../lib/networkEstimation';
import { calculateAllCentrality } from '../lib/networkCentrality';
import { detectCommunitiesWalktrap, detectCommunitiesLouvain } from '../lib/networkCommunity';
import { performFullBootstrapAnalysis } from '../lib/networkBootstrap';

export interface NetworkWorkerRequest {
  data: number[][];
  variables: string[];
  settings: {
    method: 'ebicglasso' | 'ising';
    gamma: number;
    nBootstraps: number;
    communityAlgorithm: 'walktrap' | 'louvain';
    correlationMethod: 'spearman' | 'pearson';
  };
}

self.onmessage = (e: MessageEvent<NetworkWorkerRequest>) => {
  const { data, variables, settings } = e.data;
  const progress = (percent: number, stage: string) =>
    self.postMessage({ type: 'progress', percent, stage });

  try {
    progress(5, 'Estimating network...');
    const network: EBICglassoResult | IsingResult = settings.method === 'ebicglasso'
      ? ebicGlasso(data, variables, settings.gamma, 50, settings.correlationMethod)
      : estimateIsingModel(data, variables, settings.gamma);

    progress(15, 'Calculating centrality...');
    const centrality = calculateAllCentrality(network.adjacency, variables);

    progress(20, 'Detecting communities...');
    const communities = settings.communityAlgorithm === 'walktrap'
      ? detectCommunitiesWalktrap(network.adjacency, variables)
      : detectCommunitiesLouvain(network.adjacency, variables);

    progress(25, 'Running bootstrap stability analysis...');
    const bootstrap = performFullBootstrapAnalysis(
      data,
      variables,
      settings.method,
      settings.gamma,
      settings.nBootstraps,
      (pct, stage) => progress(25 + pct * 0.73, stage),
      settings.correlationMethod
    );

    progress(99, 'Finalizing...');
    self.postMessage({ type: 'result', network, centrality, communities, bootstrap });
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
