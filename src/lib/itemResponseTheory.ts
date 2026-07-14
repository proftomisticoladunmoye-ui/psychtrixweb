/**
 * Item Response Theory (IRT) Implementation
 * 1PL (Rasch), 2PL, 3PL, and 4PL models with parameter estimation
 * Includes test equating, test linking, and DIF analysis
 */

export interface IRTParameters {
  discrimination: number;
  difficulty: number;
  guessing: number;
  slipping?: number;
}

export interface IRTResults {
  model: '1PL' | '2PL' | '3PL' | '4PL';
  itemParameters: Array<{
    item: string;
    discrimination: number;
    difficulty: number;
    guessing: number;
    slipping?: number;
    information: number;
  }>;
  personAbilities: Array<{
    person: number;
    ability: number;
    se: number;
  }>;
  fitStatistics: {
    logLikelihood: number;
    aic: number;
    bic: number;
    itemFit: Array<{
      item: string;
      infit: number;
      outfit: number;
    }>;
  };
  reliabilityIndices: {
    personSeparation: number;
    itemSeparation: number;
    personReliability: number;
    itemReliability: number;
  };
  icc: Array<{
    item: string;
    abilityLevels: number[];
    probabilities: number[];
  }>;
  tif: {
    abilityLevels: number[];
    information: number[];
    se: number[];
  };
}

export interface EquatingResults {
  method: 'mean-sigma' | 'linear' | 'equipercentile' | 'irt';
  originalScores: number[];
  equatedScores: number[];
  constants?: {
    slope?: number;
    intercept?: number;
  };
  rmse?: number;
}

export interface LinkingResults {
  method: 'mean-sigma' | 'stocking-lord' | 'haebara';
  A: number;
  B: number;
  rmse: number;
  linkedParameters: Array<{
    item: string;
    original_a: number;
    original_b: number;
    linked_a: number;
    linked_b: number;
  }>;
}

export interface DIFResults {
  item: string;
  method: 'mantel-haenszel' | 'lord' | 'raju';
  chiSquare: number;
  pValue: number;
  effectSize: number;
  classification: 'Negligible' | 'Moderate' | 'Large';
}

/**
 * IRT Model Estimator
 */
export class IRTEstimator {
  /**
   * Estimate IRT model parameters
   */
  static estimate(
    data: number[][],
    itemNames: string[],
    model: '1PL' | '2PL' | '3PL' | '4PL' = '2PL',
    maxIterations: number = 100,
    tolerance: number = 0.001
  ): IRTResults {
    const n = data.length;
    const k = data[0].length;

    let personAbilities = this.initializeAbilities(data);

    let itemParams = this.initializeItemParameters(data, model);

    for (let iter = 0; iter < maxIterations; iter++) {
      const oldParams = itemParams.map(p => ({ ...p }));

      personAbilities = this.estimateAbilities(data, itemParams, personAbilities, model);

      itemParams = this.estimateItemParameters(data, personAbilities, itemParams, model);

      const change = this.calculateParameterChange(oldParams, itemParams);
      if (change < tolerance) {
        break;
      }
    }

    const itemResults = itemNames.map((name, i) => {
      const result: any = {
        item: name,
        discrimination: parseFloat(itemParams[i].discrimination.toFixed(3)),
        difficulty: parseFloat(itemParams[i].difficulty.toFixed(3)),
        guessing: parseFloat(itemParams[i].guessing.toFixed(3)),
        information: parseFloat(this.calculateItemInformation(
          itemParams[i],
          0,
          model
        ).toFixed(3))
      };
      if (model === '4PL') {
        result.slipping = parseFloat((itemParams[i].slipping || 1.0).toFixed(3));
      }
      return result;
    });

    const personResults = personAbilities.map((ability, i) => {
      const se = this.calculateAbilitySE(ability, itemParams, model);
      return {
        person: i + 1,
        ability: parseFloat(ability.toFixed(3)),
        se: parseFloat(se.toFixed(3))
      };
    });

    const fitStats = this.calculateFitStatistics(data, personAbilities, itemParams, itemNames, model);

    const reliability = this.calculateReliability(personAbilities, itemParams, model);

    const icc = this.generateICC(itemParams, itemNames, model);

    const tif = this.generateTIF(itemParams, model);

    return {
      model,
      itemParameters: itemResults,
      personAbilities: personResults,
      fitStatistics: fitStats,
      reliabilityIndices: reliability,
      icc,
      tif
    };
  }

  /**
   * Calculate probability of correct response
   */
  private static calculateProbability(
    ability: number,
    params: IRTParameters,
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): number {
    const { discrimination, difficulty, guessing, slipping } = params;

    // Clamp exponent to prevent exp() overflow/underflow (IEEE 754 safe range)
    const exponent = Math.max(-500, Math.min(500, discrimination * (ability - difficulty)));
    const p = 1 / (1 + Math.exp(-exponent));

    if (model === '4PL') {
      const u = slipping || 1.0;
      return guessing + (u - guessing) * p;
    }

    if (model === '3PL') {
      return guessing + (1 - guessing) * p;
    }

    return p;
  }

  /**
   * Initialize person abilities using simple scoring
   */
  private static initializeAbilities(data: number[][]): number[] {
    return data.map(row => {
      const score = row.reduce((sum, val) => sum + val, 0);
      const proportion = score / row.length;

      if (proportion >= 0.99) return 2.0;
      if (proportion <= 0.01) return -2.0;

      return Math.log(proportion / (1 - proportion));
    });
  }

  /**
   * Initialize item parameters
   */
  private static initializeItemParameters(
    data: number[][],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): IRTParameters[] {
    const k = data[0].length;
    const params: IRTParameters[] = [];

    for (let i = 0; i < k; i++) {
      const itemScores = data.map(row => row[i]);
      const proportion = itemScores.reduce((sum, val) => sum + val, 0) / itemScores.length;

      const difficulty = proportion >= 0.99 ? -2.0 :
                        proportion <= 0.01 ? 2.0 :
                        -Math.log(proportion / (1 - proportion));

      const discrimination = model === '1PL' ? 1.0 : 1.0 + Math.random() * 0.5;

      const guessing = (model === '3PL' || model === '4PL') ? 0.1 + Math.random() * 0.15 : 0;

      const slipping = model === '4PL' ? 0.95 + Math.random() * 0.04 : undefined;

      params.push({ discrimination, difficulty, guessing, slipping });
    }

    return params;
  }

  /**
   * Estimate person abilities using Newton-Raphson
   */
  private static estimateAbilities(
    data: number[][],
    itemParams: IRTParameters[],
    currentAbilities: number[],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): number[] {
    const newAbilities: number[] = [];

    for (let i = 0; i < data.length; i++) {
      let ability = currentAbilities[i];

      for (let iter = 0; iter < 10; iter++) {
        let firstDeriv = 0;
        let secondDeriv = 0;

        for (let j = 0; j < data[i].length; j++) {
          const response = data[i][j];
          const prob = this.calculateProbability(ability, itemParams[j], model);

          const q = 1 - prob;
          const a = itemParams[j].discrimination;

          if (model === '3PL' || model === '4PL') {
            const c = itemParams[j].guessing;
            const u = (model === '4PL' && itemParams[j].slipping != null) ? itemParams[j].slipping! : 1.0;
            // Correct score equations for 3PL/4PL (Bock & Aitkin 1981):
            // P'(θ) = a*(u-c)*P*(θ)*(1-P*(θ)) where P*(θ) = (P(θ)-c)/(u-c)
            // dL/dθ  = Σ [P'(θ)/P(θ)] * (resp - P(θ)) / (P(θ)*(1-P(θ)))  -- but simplifies to:
            // dL/dθ  = Σ a*(u-c)*P*(1-P*) * (resp - P) / (P*(1-P))
            const rangeUC = u - c;
            if (prob > 1e-10 && q > 1e-10 && Math.abs(rangeUC) > 1e-10) {
              const pStar = (prob - c) / rangeUC;
              const qStar = 1 - pStar;
              const weight = rangeUC * pStar * qStar / (prob * q);
              firstDeriv += a * weight * (response - prob);
              secondDeriv -= a * a * weight * weight * prob * q;
            }
          } else {
            firstDeriv += a * (response - prob);
            secondDeriv -= a * a * prob * q;
          }
        }

        if (Math.abs(secondDeriv) < 1e-10) break;

        const change = firstDeriv / secondDeriv;
        ability -= change;

        if (Math.abs(change) < 0.001) break;
      }

      ability = Math.max(-4, Math.min(4, ability));
      newAbilities.push(ability);
    }

    return newAbilities;
  }

  /**
   * Estimate item parameters using Newton-Raphson
   */
  private static estimateItemParameters(
    data: number[][],
    abilities: number[],
    currentParams: IRTParameters[],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): IRTParameters[] {
    const newParams: IRTParameters[] = [];

    for (let j = 0; j < currentParams.length; j++) {
      let params = { ...currentParams[j] };

      for (let iter = 0; iter < 10; iter++) {
        let dDiff = 0, d2Diff = 0;
        let dDisc = 0, d2Disc = 0;

        for (let i = 0; i < data.length; i++) {
          const response = data[i][j];
          const ability = abilities[i];
          const prob = this.calculateProbability(ability, params, model);
          const q = 1 - prob;

          const a = params.discrimination;
          const b = params.difficulty;
          const diff = ability - b;

          dDiff += -a * (response - prob);
          d2Diff -= a * a * prob * q;

          if (model !== '1PL') {
            dDisc += diff * (response - prob);
            d2Disc -= diff * diff * prob * q;
          }
        }

        if (Math.abs(d2Diff) > 1e-10) {
          const changeDiff = dDiff / d2Diff;
          params.difficulty -= changeDiff;
          params.difficulty = Math.max(-4, Math.min(4, params.difficulty));
        }

        if (model !== '1PL' && Math.abs(d2Disc) > 1e-10) {
          const changeDisc = dDisc / d2Disc;
          params.discrimination -= changeDisc;
          params.discrimination = Math.max(0.1, Math.min(3, params.discrimination));
        }

        if (Math.abs(dDiff) < 0.001 && Math.abs(dDisc) < 0.001) break;
      }

      newParams.push(params);
    }

    return newParams;
  }

  /**
   * Calculate parameter change for convergence check
   */
  private static calculateParameterChange(
    oldParams: IRTParameters[],
    newParams: IRTParameters[]
  ): number {
    let maxChange = 0;

    for (let i = 0; i < oldParams.length; i++) {
      const diffChange = Math.abs(newParams[i].difficulty - oldParams[i].difficulty);
      const discChange = Math.abs(newParams[i].discrimination - oldParams[i].discrimination);

      maxChange = Math.max(maxChange, diffChange, discChange);
    }

    return maxChange;
  }

  /**
   * Calculate item information
   */
  private static calculateItemInformation(
    params: IRTParameters,
    ability: number,
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): number {
    const prob = this.calculateProbability(ability, params, model);
    const q = 1 - prob;

    const a = params.discrimination;

    if (model === '4PL') {
      // I(θ) = [P'(θ)]² / (P·Q), P'(θ) = a·(u-c)·P*(1-P*)
      const c = params.guessing;
      const u = params.slipping ?? 1.0;
      const rangeUC = u - c;
      if (Math.abs(rangeUC) < 1e-10 || prob < 1e-10 || q < 1e-10) return 0;
      const pStar = (prob - c) / rangeUC;
      const qStar = 1 - pStar;
      const pPrime = a * rangeUC * pStar * qStar;
      return (pPrime * pPrime) / (prob * q);
    }

    if (model === '3PL') {
      // I(θ) = a²·(P-c)²·(1-P) / ((1-c)²·P)  [Baker & Kim 2004, eq. 6.3]
      const c = params.guessing;
      const oneMinusC = 1 - c;
      if (oneMinusC < 1e-10 || prob < 1e-10 || q < 1e-10) return 0;
      const pMinusC = prob - c;
      return (a * a * pMinusC * pMinusC * q) / (oneMinusC * oneMinusC * prob);
    }

    return a * a * prob * q;
  }

  /**
   * Calculate ability standard error
   */
  private static calculateAbilitySE(
    ability: number,
    itemParams: IRTParameters[],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): number {
    let totalInfo = 0;

    for (const params of itemParams) {
      totalInfo += this.calculateItemInformation(params, ability, model);
    }

    return totalInfo > 0 ? 1 / Math.sqrt(totalInfo) : 1.0;
  }

  /**
   * Calculate fit statistics
   */
  private static calculateFitStatistics(
    data: number[][],
    abilities: number[],
    itemParams: IRTParameters[],
    itemNames: string[],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): any {
    let logLikelihood = 0;

    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        const prob = this.calculateProbability(abilities[i], itemParams[j], model);
        const response = data[i][j];

        const p = response === 1 ? prob : 1 - prob;
        logLikelihood += Math.log(Math.max(p, 1e-10));
      }
    }

    const nParams = model === '1PL' ? itemParams.length + data.length :
                    model === '2PL' ? 2 * itemParams.length + data.length :
                    model === '3PL' ? 3 * itemParams.length + data.length :
                    4 * itemParams.length + data.length;

    const aic = -2 * logLikelihood + 2 * nParams;
    const bic = -2 * logLikelihood + nParams * Math.log(data.length);

    const itemFit = itemNames.map((name, j) => {
      // Infit MNSQ: variance-weighted mean of squared standardized residuals (Wright & Masters 1982)
      // Outfit MNSQ: unweighted mean of squared standardized residuals
      let infitNumerator = 0, infitDenominator = 0;
      let outfitSum = 0;
      let count = 0;

      for (let i = 0; i < data.length; i++) {
        const prob = this.calculateProbability(abilities[i], itemParams[j], model);
        const response = data[i][j];

        const variance = prob * (1 - prob);

        if (variance > 0) {
          const residual = response - prob;
          const stdResidualSq = (residual * residual) / variance;
          // Infit weight = variance = P(1-P)
          infitNumerator += variance * stdResidualSq;
          infitDenominator += variance;
          outfitSum += stdResidualSq;
          count++;
        }
      }

      return {
        item: name,
        infit: infitDenominator > 0 ? parseFloat((infitNumerator / infitDenominator).toFixed(3)) : 1.0,
        outfit: count > 0 ? parseFloat((outfitSum / count).toFixed(3)) : 1.0
      };
    });

    return {
      logLikelihood: parseFloat(logLikelihood.toFixed(2)),
      aic: parseFloat(aic.toFixed(2)),
      bic: parseFloat(bic.toFixed(2)),
      itemFit
    };
  }

  /**
   * Calculate reliability indices
   */
  private static calculateReliability(
    abilities: number[],
    itemParams: IRTParameters[],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): any {
    const abilityVar = this.variance(abilities);
    // Mean squared SE across persons (Wright & Masters 1982, eq. 2.4)
    const abilitySEs = abilities.map(ability =>
      this.calculateAbilitySE(ability, itemParams, model)
    );
    const meanErrorVar = abilitySEs.reduce((sum, se) => sum + se * se, 0) / abilitySEs.length;

    const personReliability = abilityVar > meanErrorVar
      ? (abilityVar - meanErrorVar) / abilityVar
      : 0;
    const personSeparation = personReliability > 0 && personReliability < 1
      ? Math.sqrt(personReliability / (1 - personReliability))
      : 0;

    const difficulties = itemParams.map(p => p.difficulty);
    const diffVar = this.variance(difficulties);
    // Item SE: 1/sqrt(total Fisher information summed across persons
    const itemSEs = itemParams.map((_, j) => {
      const totalInfo = abilities.reduce((sum, theta) => {
        return sum + this.calculateItemInformation(itemParams[j], theta, model);
      }, 0);
      return totalInfo > 0 ? 1 / Math.sqrt(totalInfo) : 1.0;
    });
    const meanItemErrorVar = itemSEs.reduce((sum, se) => sum + se * se, 0) / itemSEs.length;
    const itemReliability = diffVar > meanItemErrorVar
      ? Math.min(1, (diffVar - meanItemErrorVar) / diffVar)
      : 0;
    const itemSeparation = itemReliability > 0 && itemReliability < 1
      ? Math.sqrt(itemReliability / (1 - itemReliability))
      : 0;

    return {
      personSeparation: parseFloat(personSeparation.toFixed(3)),
      itemSeparation: parseFloat(itemSeparation.toFixed(3)),
      personReliability: parseFloat(personReliability.toFixed(3)),
      itemReliability: parseFloat(itemReliability.toFixed(3))
    };
  }

  /**
   * Generate Item Characteristic Curves
   */
  private static generateICC(
    itemParams: IRTParameters[],
    itemNames: string[],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): Array<any> {
    const abilityLevels = [];
    for (let theta = -4; theta <= 4; theta += 0.2) {
      abilityLevels.push(parseFloat(theta.toFixed(2)));
    }

    return itemNames.map((name, i) => ({
      item: name,
      abilityLevels,
      probabilities: abilityLevels.map(theta =>
        parseFloat(this.calculateProbability(theta, itemParams[i], model).toFixed(4))
      )
    }));
  }

  /**
   * Generate Test Information Function
   */
  private static generateTIF(
    itemParams: IRTParameters[],
    model: '1PL' | '2PL' | '3PL' | '4PL'
  ): any {
    const abilityLevels = [];
    for (let theta = -4; theta <= 4; theta += 0.2) {
      abilityLevels.push(parseFloat(theta.toFixed(2)));
    }

    const information = abilityLevels.map(theta => {
      let totalInfo = 0;
      for (const params of itemParams) {
        totalInfo += this.calculateItemInformation(params, theta, model);
      }
      return parseFloat(totalInfo.toFixed(3));
    });

    const se = information.map(info =>
      info > 0 ? parseFloat((1 / Math.sqrt(info)).toFixed(3)) : 1.0
    );

    return {
      abilityLevels,
      information,
      se
    };
  }

  private static variance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / (values.length - 1);
  }

  /**
   * Test Equating - Mean-Sigma Method
   */
  static equateMeanSigma(
    formXScores: number[],
    formYScores: number[]
  ): EquatingResults {
    const meanX = formXScores.reduce((a, b) => a + b, 0) / formXScores.length;
    const meanY = formYScores.reduce((a, b) => a + b, 0) / formYScores.length;

    const sdX = Math.sqrt(this.variance(formXScores));
    const sdY = Math.sqrt(this.variance(formYScores));

    if (sdX < 1e-10) return { method: 'mean-sigma', originalScores: formXScores, equatedScores: formXScores.map(() => meanY), constants: { slope: 1, intercept: meanY - meanX }, rmse: 0 };
    const slope = sdY / sdX;
    const intercept = meanY - slope * meanX;

    const equatedScores = formXScores.map(x => slope * x + intercept);

    const rmse = Math.sqrt(
      formYScores.reduce((sum, y, i) => sum + Math.pow(y - equatedScores[i], 2), 0) / formYScores.length
    );

    return {
      method: 'mean-sigma',
      originalScores: formXScores,
      equatedScores,
      constants: { slope, intercept },
      rmse
    };
  }

  /**
   * Test Equating - Linear Equating
   */
  static equateLinear(
    formXScores: number[],
    formYScores: number[]
  ): EquatingResults {
    const n = formXScores.length;
    const sumX = formXScores.reduce((a, b) => a + b, 0);
    const sumY = formYScores.reduce((a, b) => a + b, 0);
    const sumXY = formXScores.reduce((sum, x, i) => sum + x * formYScores[i], 0);
    const sumX2 = formXScores.reduce((sum, x) => sum + x * x, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return { method: 'linear', originalScores: formXScores, equatedScores: formXScores.slice(), rmse: 0 };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const equatedScores = formXScores.map(x => slope * x + intercept);

    const rmse = Math.sqrt(
      formYScores.reduce((sum, y, i) => sum + Math.pow(y - equatedScores[i], 2), 0) / n
    );

    return {
      method: 'linear',
      originalScores: formXScores,
      equatedScores,
      constants: { slope, intercept },
      rmse
    };
  }

  /**
   * Test Equating - Equipercentile Method
   */
  static equateEquipercentile(
    formXScores: number[],
    formYScores: number[]
  ): EquatingResults {
    const sortedX = [...formXScores].sort((a, b) => a - b);
    const sortedY = [...formYScores].sort((a, b) => a - b);

    const equatedScores = formXScores.map(x => {
      const percentileX = sortedX.filter(val => val <= x).length / sortedX.length;
      const index = Math.floor(percentileX * sortedY.length);
      return sortedY[Math.min(index, sortedY.length - 1)];
    });

    const rmse = Math.sqrt(
      formYScores.reduce((sum, y, i) => sum + Math.pow(y - equatedScores[i], 2), 0) / formYScores.length
    );

    return {
      method: 'equipercentile',
      originalScores: formXScores,
      equatedScores,
      rmse
    };
  }

  /**
   * Test Equating - IRT True Score Equating
   */
  static equateIRT(
    formXParams: IRTParameters[],
    formYParams: IRTParameters[],
    abilityLevels: number[],
    model: '1PL' | '2PL' | '3PL' | '4PL' = '2PL'
  ): EquatingResults {
    const trueScoresX = abilityLevels.map(theta => {
      return formXParams.reduce((sum, params) => {
        return sum + this.calculateProbability(theta, params, model);
      }, 0);
    });

    const trueScoresY = abilityLevels.map(theta => {
      return formYParams.reduce((sum, params) => {
        return sum + this.calculateProbability(theta, params, model);
      }, 0);
    });

    const rmse = Math.sqrt(
      trueScoresY.reduce((sum, y, i) => sum + Math.pow(y - trueScoresX[i], 2), 0) / trueScoresY.length
    );

    return {
      method: 'irt',
      originalScores: trueScoresX,
      equatedScores: trueScoresY,
      rmse
    };
  }

  /**
   * Test Linking - Mean-Sigma Method
   */
  static linkMeanSigma(
    formXParams: IRTParameters[],
    formYParams: IRTParameters[]
  ): LinkingResults {
    const diffX = formXParams.map(p => p.difficulty);
    const diffY = formYParams.map(p => p.difficulty);

    const meanX = diffX.reduce((a, b) => a + b, 0) / diffX.length;
    const meanY = diffY.reduce((a, b) => a + b, 0) / diffY.length;

    const sdX = Math.sqrt(this.variance(diffX));
    const sdY = Math.sqrt(this.variance(diffY));

    const A = sdY / sdX;
    const B = meanY - A * meanX;

    const linkedParameters = formXParams.map((params, i) => ({
      item: `Item${i + 1}`,
      original_a: params.discrimination,
      original_b: params.difficulty,
      linked_a: params.discrimination / A,
      linked_b: A * params.difficulty + B
    }));

    const predictions = diffX.map(b => A * b + B);
    const rmse = Math.sqrt(
      diffY.reduce((sum, b, i) => sum + Math.pow(b - predictions[i], 2), 0) / diffY.length
    );

    return {
      method: 'mean-sigma',
      A,
      B,
      rmse,
      linkedParameters
    };
  }

  /**
   * Test Linking - Stocking-Lord Method
   * Minimizes Σ_θ Σ_i [P_Y(θ) - P_X(Aθ+B)]² with respect to A and B.
   * Uses gradient descent with numerical gradients (Stocking & Lord 1983).
   */
  static linkStockingLord(
    formXParams: IRTParameters[],
    formYParams: IRTParameters[],
    model: '1PL' | '2PL' | '3PL' | '4PL' = '2PL'
  ): LinkingResults {
    let A = 1.0;
    let B = 0.0;

    const abilityLevels: number[] = [];
    for (let theta = -3; theta <= 3; theta += 0.5) abilityLevels.push(theta);

    const objective = (a: number, b: number): number => {
      let sum = 0;
      for (const theta of abilityLevels) {
        for (let i = 0; i < formXParams.length; i++) {
          const pX = this.calculateProbability(a * theta + b, formXParams[i], model);
          const pY = this.calculateProbability(theta, formYParams[i], model);
          sum += (pY - pX) * (pY - pX);
        }
      }
      return sum;
    };

    // Gradient descent with adaptive step size
    let lr = 0.01;
    for (let iter = 0; iter < 500; iter++) {
      const h = 1e-5;
      const gradA = (objective(A + h, B) - objective(A - h, B)) / (2 * h);
      const gradB = (objective(A, B + h) - objective(A, B - h)) / (2 * h);

      const newA = A - lr * gradA;
      const newB = B - lr * gradB;

      if (objective(newA, newB) < objective(A, B)) {
        A = newA;
        B = newB;
        lr *= 1.05; // increase step if improving
      } else {
        lr *= 0.5; // reduce step on failure
      }
      if (lr < 1e-8) break;
      if (Math.abs(gradA) + Math.abs(gradB) < 1e-8) break;
    }

    const linkedParameters = formXParams.map((params, i) => ({
      item: `Item${i + 1}`,
      original_a: params.discrimination,
      original_b: params.difficulty,
      linked_a: params.discrimination / A,
      linked_b: A * params.difficulty + B
    }));

    let sumSqDiff = 0;
    for (const theta of abilityLevels) {
      for (let i = 0; i < formXParams.length; i++) {
        const pX = this.calculateProbability(A * theta + B, formXParams[i], model);
        const pY = this.calculateProbability(theta, formYParams[i], model);
        sumSqDiff += Math.pow(pY - pX, 2);
      }
    }
    const rmse = Math.sqrt(sumSqDiff / (abilityLevels.length * formXParams.length));

    return {
      method: 'stocking-lord',
      A,
      B,
      rmse,
      linkedParameters
    };
  }

  /**
   * Differential Item Functioning - Mantel-Haenszel Method
   */
  static analyzeDIFMantelHaenszel(
    data: number[][],
    groupIndicator: number[],
    itemIndex: number
  ): DIFResults {
    const totalScores = data.map(row => row.reduce((a, b) => a + b, 0));
    const uniqueScores = [...new Set(totalScores)].sort((a, b) => a - b);

    // MH accumulates: numerator terms A_s and expected A_s under H0
    let sumA = 0;       // Σ A_s  (observed ref-correct at score level s)
    let sumE = 0;       // Σ E_s  (expected ref-correct under H0)
    let sumV = 0;       // Σ V_s  (hypergeometric variance)
    let sumNum = 0;     // Σ (A_s * D_s / n_s)  for odds-ratio numerator
    let sumDen = 0;     // Σ (B_s * C_s / n_s)  for odds-ratio denominator

    for (const score of uniqueScores) {
      const indicesAtScore = totalScores
        .map((s, i) => s === score ? i : -1)
        .filter(i => i !== -1);

      const refGroup = indicesAtScore.filter(i => groupIndicator[i] === 0);
      const focalGroup = indicesAtScore.filter(i => groupIndicator[i] === 1);

      // 2×2 table at each score level:
      // A = ref correct, B = ref incorrect, C = focal correct, D = focal incorrect
      const A = refGroup.filter(i => data[i][itemIndex] === 1).length;
      const B = refGroup.length - A;
      const C = focalGroup.filter(i => data[i][itemIndex] === 1).length;
      const D = focalGroup.length - C;
      const nRef = refGroup.length;
      const nFocal = focalGroup.length;
      const nTotal = nRef + nFocal;
      const nCorrect = A + C;
      const nIncorrect = B + D;

      if (nTotal > 1 && nCorrect > 0 && nCorrect < nTotal) {
        // Expected value and hypergeometric variance for MH chi-square
        const E = (nRef * nCorrect) / nTotal;
        const V = (nRef * nFocal * nCorrect * nIncorrect) / (nTotal * nTotal * (nTotal - 1));
        sumA += A;
        sumE += E;
        sumV += V;

        // For common log odds ratio (Mantel & Haenszel 1959)
        sumNum += (A * D) / nTotal;
        sumDen += (B * C) / nTotal;
      }
    }

    // MH chi-square with continuity correction (Holland & Thayer 1988)
    const chiSquare = sumV > 0
      ? Math.pow(Math.max(0, Math.abs(sumA - sumE) - 0.5), 2) / sumV
      : 0;
    const pValue = 1 - this.chiSquareCDF(chiSquare, 1);

    // MH log odds ratio: αMH = sumNum/sumDen
    const alphaMH = sumDen > 0 ? sumNum / sumDen : 1;
    // ETS Delta metric effect size: Δ = -2.35 * ln(αMH)
    const effectSize = alphaMH > 0 ? Math.abs(-2.35 * Math.log(alphaMH)) : 0;
    const classification = effectSize < 1 ? 'Negligible' : effectSize < 1.5 ? 'Moderate' : 'Large';

    return {
      item: `Item${itemIndex + 1}`,
      method: 'mantel-haenszel',
      chiSquare: parseFloat(chiSquare.toFixed(3)),
      pValue: parseFloat(pValue.toFixed(4)),
      effectSize: parseFloat(effectSize.toFixed(3)),
      classification
    };
  }

  /**
   * Chi-square CDF via regularized lower incomplete gamma function P(k/2, x/2).
   * Uses the series expansion for small x and continued fraction for large x.
   */
  private static chiSquareCDF(x: number, df: number): number {
    if (x <= 0 || df <= 0) return 0;
    return this.regularizedGammaP(df / 2, x / 2);
  }

  /** Regularized lower incomplete gamma P(a, x) via series or continued fraction. */
  private static regularizedGammaP(a: number, x: number): number {
    if (x < 0) return 0;
    if (x === 0) return 0;
    if (x < a + 1) {
      // Series expansion
      let term = 1 / a;
      let sum = term;
      for (let n = 1; n <= 200; n++) {
        term *= x / (a + n);
        sum += term;
        if (Math.abs(term) < 1e-12 * Math.abs(sum)) break;
      }
      return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a)));
    } else {
      // Continued fraction (Lentz method)
      return 1 - this.regularizedGammaQ_cf(a, x);
    }
  }

  /** Regularized upper incomplete gamma Q(a,x) via Lentz continued fraction. */
  private static regularizedGammaQ_cf(a: number, x: number): number {
    const fpmin = 1e-300;
    let b = x + 1 - a;
    let c = 1 / fpmin;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = b + an / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return Math.exp(-x + a * Math.log(x) - this.logGamma(a)) * h;
  }

  /** Log-Gamma via Lanczos approximation. */
  private static logGamma(z: number): number {
    const g = 7;
    const c = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - this.logGamma(1 - z);
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z - 1 + i);
    const t = z - 1 + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(x);
  }

  /**
   * Normal CDF approximation
   */
  private static normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - probability : probability;
  }
}
