import { ChartJSOrUndefined } from 'react-chartjs-2/dist/types';

export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportToJSON = (data: any, filename: string) => {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportChartAsImage = (chartRef: React.RefObject<ChartJSOrUndefined<any>>, filename: string) => {
  if (!chartRef.current) return;

  const canvas = chartRef.current.canvas;
  if (!canvas) return;

  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
};

export const exportResultsToPDF = (results: any, analysisType: string) => {
  const timestamp = new Date().toLocaleString();

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${analysisType} Results</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
        }
        h1 {
          color: #1e40af;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          margin-top: 30px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 8px;
        }
        h3 {
          color: #3b82f6;
          margin-top: 20px;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        .metric-box {
          display: inline-block;
          margin: 10px 15px 10px 0;
          padding: 15px 20px;
          border-radius: 8px;
          background-color: #eff6ff;
          border-left: 4px solid #3b82f6;
        }
        .metric-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 5px;
        }
        .metric-value {
          font-size: 24px;
          font-weight: bold;
          color: #1e40af;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        .guideline {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          margin: 15px 0;
          border-left: 4px solid #10b981;
        }
        .interpretation {
          background-color: #fef3c7;
          padding: 10px 15px;
          border-radius: 6px;
          margin: 10px 0;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <h1>${analysisType} Analysis Report</h1>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Advanced Psychometric Analysis</p>
  `;

  if (analysisType === 'CFA') {
    htmlContent += `
      <h2>Model Fit Indices</h2>
      <div style="margin: 20px 0;">
        <div class="metric-box">
          <div class="metric-label">Chi-Square (χ²)</div>
          <div class="metric-value">${results.fitIndices.chisq}</div>
          <div class="metric-label">df = ${results.fitIndices.df}, p = ${results.fitIndices.pvalue}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">CFI</div>
          <div class="metric-value">${results.fitIndices.cfi}</div>
          <div class="metric-label">${parseFloat(results.fitIndices.cfi) > 0.95 ? 'Excellent' : parseFloat(results.fitIndices.cfi) > 0.90 ? 'Good' : 'Poor'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">TLI</div>
          <div class="metric-value">${results.fitIndices.tli}</div>
          <div class="metric-label">${parseFloat(results.fitIndices.tli) > 0.95 ? 'Excellent' : parseFloat(results.fitIndices.tli) > 0.90 ? 'Good' : 'Poor'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">RMSEA</div>
          <div class="metric-value">${results.fitIndices.rmsea}</div>
          <div class="metric-label">${parseFloat(results.fitIndices.rmsea) < 0.05 ? 'Excellent' : parseFloat(results.fitIndices.rmsea) < 0.08 ? 'Good' : 'Poor'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">SRMR</div>
          <div class="metric-value">${results.fitIndices.srmr}</div>
        </div>
      </div>

      <div class="guideline">
        <h3>Fit Index Interpretation Guidelines</h3>
        <ul>
          <li><strong>CFI/TLI:</strong> > 0.95 excellent, > 0.90 acceptable</li>
          <li><strong>RMSEA:</strong> < 0.05 excellent, < 0.08 acceptable</li>
          <li><strong>SRMR:</strong> < 0.08 good fit</li>
          <li><strong>χ²/df:</strong> < 3 acceptable, < 2 good</li>
        </ul>
      </div>

      <h2>Standardized Factor Loadings</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Factor</th>
            <th>Loading</th>
            <th>SE</th>
            <th>z-value</th>
            <th>p-value</th>
          </tr>
        </thead>
        <tbody>
          ${results.factorLoadings.map((fl: any) => `
            <tr>
              <td>${fl.item}</td>
              <td>${fl.factor}</td>
              <td><strong>${Number(fl.loading).toFixed(3)}</strong></td>
              <td>${Number(fl.se).toFixed(3)}</td>
              <td>${Number(fl.z ?? fl.zvalue).toFixed(3)}</td>
              <td>${Number(fl.pvalue).toFixed(3)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${results.factorCorrelations.length > 0 ? `
        <h2>Factor Correlations</h2>
        <table>
          <thead>
            <tr>
              <th>Factor 1</th>
              <th>Factor 2</th>
              <th>Correlation</th>
            </tr>
          </thead>
          <tbody>
            ${results.factorCorrelations.map((fc: any) => `
              <tr>
                <td>${fc.factor1}</td>
                <td>${fc.factor2}</td>
                <td><strong>${fc.correlation}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      <h2>Modification Indices (MI > 10)</h2>
      <table>
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
            <th>MI</th>
            <th>EPC</th>
          </tr>
        </thead>
        <tbody>
          ${results.modificationIndices.map((mi: any) => `
            <tr>
              <td>${mi.from}</td>
              <td>${mi.to}</td>
              <td><strong>${mi.mi}</strong></td>
              <td>${mi.epc}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p><em>MI: Modification Index | EPC: Expected Parameter Change</em></p>
    `;
  } else if (analysisType === 'Measurement Invariance') {
    htmlContent += `
      <h2>Invariance Test Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>χ²</th>
            <th>df</th>
            <th>CFI</th>
            <th>RMSEA</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Configural</strong></td>
            <td>${results.configural.chisq}</td>
            <td>${results.configural.df}</td>
            <td>${results.configural.cfi}</td>
            <td>${results.configural.rmsea}</td>
          </tr>
          <tr>
            <td><strong>Metric</strong></td>
            <td>${results.metric.chisq}</td>
            <td>${results.metric.df}</td>
            <td>${results.metric.cfi}</td>
            <td>${results.metric.rmsea}</td>
          </tr>
          <tr>
            <td><strong>Scalar</strong></td>
            <td>${results.scalar.chisq}</td>
            <td>${results.scalar.df}</td>
            <td>${results.scalar.cfi}</td>
            <td>${results.scalar.rmsea}</td>
          </tr>
          <tr>
            <td><strong>Strict</strong></td>
            <td>${results.strict.chisq}</td>
            <td>${results.strict.df}</td>
            <td>${results.strict.cfi}</td>
            <td>${results.strict.rmsea}</td>
          </tr>
        </tbody>
      </table>

      <h2>Model Comparisons</h2>
      ${results.comparisons.map((comp: any) => `
        <div class="interpretation">
          <strong>${comp.comparison}</strong><br>
          ΔCFI: ${comp.deltaCFI} | ΔRMSEA: ${comp.deltaRMSEA}<br>
          <strong>Decision:</strong> ${comp.decision}
        </div>
      `).join('')}

      <div class="guideline">
        <h3>Interpretation Guidelines</h3>
        <ul>
          <li><strong>ΔCFI ≤ -0.010:</strong> Invariance supported</li>
          <li><strong>ΔRMSEA ≤ 0.015:</strong> Invariance supported</li>
          <li>If both criteria met, proceed to next level of invariance</li>
          <li>For partial invariance, free non-invariant parameters</li>
        </ul>
      </div>
    `;
  }

  htmlContent += `
      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform</p>
        <p>This report was automatically generated. Please verify results and consult with a psychometrician for critical decisions.</p>
        <p><strong>References:</strong></p>
        <ul style="font-size: 11px; margin-top: 10px;">
          <li>Hu, L., & Bentler, P. M. (1999). Cutoff criteria for fit indexes in covariance structure analysis. Structural Equation Modeling, 6(1), 1-55.</li>
          <li>Cheung, G. W., & Rensvold, R. B. (2002). Evaluating goodness-of-fit indexes for testing measurement invariance. Structural Equation Modeling, 9(2), 233-255.</li>
        </ul>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${analysisType.replace(/\s+/g, '_')}_Report_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportCTTResults = (results: any) => {
  if (!results || !results.itemStatistics) {
    console.error('No results to export');
    return;
  }

  const timestamp = new Date().toLocaleString();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>CTT Analysis Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
          line-height: 1.6;
        }
        h1 {
          color: #1e40af;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          margin-top: 30px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 8px;
        }
        h3 {
          color: #3b82f6;
          margin-top: 20px;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 20px 0;
          font-size: 13px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 10px;
          text-align: left;
        }
        th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        .metric-container {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin: 20px 0;
        }
        .metric-box {
          flex: 0 0 calc(33.333% - 10px);
          padding: 15px 20px;
          border-radius: 8px;
          background-color: #eff6ff;
          border-left: 4px solid #3b82f6;
        }
        .metric-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 5px;
        }
        .metric-value {
          font-size: 24px;
          font-weight: bold;
          color: #1e40af;
        }
        .interpretation {
          background-color: #fef3c7;
          padding: 15px;
          border-radius: 8px;
          margin: 15px 0;
          border-left: 4px solid #f59e0b;
        }
        .guideline {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          margin: 15px 0;
          border-left: 4px solid #10b981;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        @media print {
          body { margin: 20px; }
          .metric-box { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      </style>
    </head>
    <body>
      <h1>Classical Test Theory (CTT) Analysis Report</h1>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Advanced Psychometric Analysis</p>
      <p><strong>Analysis Type:</strong> Classical Test Theory & Reliability Analysis</p>

      <h2>Overall Reliability Metrics</h2>
      <div class="metric-container">
        <div class="metric-box">
          <div class="metric-label">Cronbach's Alpha</div>
          <div class="metric-value">${results.cronbachAlpha?.toFixed(3) || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Standardized Alpha</div>
          <div class="metric-value">${results.standardizedAlpha?.toFixed(3) || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">McDonald's Omega</div>
          <div class="metric-value">${results.omegaTotal?.toFixed(3) || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Greatest Lower Bound (GLB)</div>
          <div class="metric-value">${results.glb?.toFixed(3) || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Composite Reliability</div>
          <div class="metric-value">${results.compositeReliability?.toFixed(3) || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Average Variance Extracted</div>
          <div class="metric-value">${results.averageVarianceExtracted?.toFixed(3) || 'N/A'}</div>
        </div>
      </div>

      <div class="interpretation">
        <h3>Interpretation</h3>
        <p><strong>${results.interpretation || 'No interpretation available'}</strong></p>
      </div>

      <div class="guideline">
        <h3>Reliability Guidelines</h3>
        <ul>
          <li><strong>α ≥ 0.90:</strong> Excellent reliability</li>
          <li><strong>0.80 ≤ α < 0.90:</strong> Good reliability</li>
          <li><strong>0.70 ≤ α < 0.80:</strong> Acceptable reliability</li>
          <li><strong>0.60 ≤ α < 0.70:</strong> Questionable reliability</li>
          <li><strong>α < 0.60:</strong> Poor reliability</li>
        </ul>
      </div>

      <h2>Scale Descriptive Statistics</h2>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Number of Items</td>
          <td>${results.nItems || 0}</td>
        </tr>
        <tr>
          <td>Number of Respondents</td>
          <td>${results.nRespondents || 0}</td>
        </tr>
        <tr>
          <td>Scale Mean</td>
          <td>${results.scaleMean?.toFixed(3) || 'N/A'}</td>
        </tr>
        <tr>
          <td>Scale Variance</td>
          <td>${results.scaleVariance?.toFixed(3) || 'N/A'}</td>
        </tr>
        <tr>
          <td>Scale SEM</td>
          <td>${results.scaleSEM?.toFixed(3) || 'N/A'}</td>
        </tr>
        <tr>
          <td>Mean Inter-Item Correlation</td>
          <td>${results.meanInterItemCorrelation?.toFixed(3) || 'N/A'}</td>
        </tr>
      </table>

      <h2>Split-Half Reliability</h2>
      ${results.splitHalf ? `
        <table>
          <tr>
            <th>Method</th>
            <th>Value</th>
          </tr>
          <tr>
            <td>Part 1 Alpha</td>
            <td>${results.splitHalf.part1Alpha?.toFixed(3) || 'N/A'}</td>
          </tr>
          <tr>
            <td>Part 2 Alpha</td>
            <td>${results.splitHalf.part2Alpha?.toFixed(3) || 'N/A'}</td>
          </tr>
          <tr>
            <td>Correlation between parts</td>
            <td>${results.splitHalf.correlation?.toFixed(3) || 'N/A'}</td>
          </tr>
          <tr>
            <td>Spearman-Brown Coefficient</td>
            <td>${results.splitHalf.spearmanBrown?.toFixed(3) || 'N/A'}</td>
          </tr>
          <tr>
            <td>Guttman's Lambda-6</td>
            <td>${results.splitHalf.guttmanLambda?.toFixed(3) || 'N/A'}</td>
          </tr>
        </table>
      ` : '<p>Split-half reliability not calculated</p>'}

      <h2>Item Statistics</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Mean</th>
            <th>SD</th>
            <th>Item-Total r</th>
            <th>Item-Rest r</th>
            <th>α if Deleted</th>
            <th>Difficulty</th>
            <th>Discrimination</th>
            <th>Interpretation</th>
          </tr>
        </thead>
        <tbody>
          ${results.itemStatistics.map((item: any) => `
            <tr>
              <td><strong>${item.name}</strong></td>
              <td>${item.mean?.toFixed(2) || 'N/A'}</td>
              <td>${item.sd?.toFixed(2) || 'N/A'}</td>
              <td>${item.itemTotalCorrelation?.toFixed(3) || 'N/A'}</td>
              <td>${item.itemRestCorrelation?.toFixed(3) || 'N/A'}</td>
              <td>${item.alphaIfDeleted?.toFixed(3) || 'N/A'}</td>
              <td>${item.difficulty?.toFixed(3) || 'N/A'}</td>
              <td>${item.discrimination?.toFixed(3) || 'N/A'}</td>
              <td>${item.interpretation || 'N/A'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="guideline">
        <h3>Item Statistics Interpretation</h3>
        <ul>
          <li><strong>Item-Total Correlation (r<sub>it</sub>):</strong> > 0.30 is generally acceptable</li>
          <li><strong>Item-Rest Correlation (r<sub>ir</sub>):</strong> > 0.30 indicates good discrimination</li>
          <li><strong>Difficulty:</strong> 0.30-0.70 is optimal for most tests</li>
          <li><strong>Discrimination:</strong> > 0.30 is good, > 0.40 is excellent</li>
          <li><strong>Alpha if Deleted:</strong> If greater than overall α, consider removing item</li>
        </ul>
      </div>

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform</p>
        <p>This report was automatically generated. Please verify results and consult with a psychometrician for critical decisions.</p>
        <p><strong>Key References:</strong></p>
        <ul style="font-size: 11px; margin-top: 10px;">
          <li>Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297-334.</li>
          <li>McDonald, R. P. (1999). Test theory: A unified treatment. Mahwah, NJ: Erlbaum.</li>
          <li>Nunnally, J. C., & Bernstein, I. H. (1994). Psychometric theory (3rd ed.). New York: McGraw-Hill.</li>
          <li>Revelle, W., & Zinbarg, R. E. (2009). Coefficients alpha, beta, omega, and the glb. Psychometrika, 74(1), 145-154.</li>
        </ul>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `CTT_Analysis_Report_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportIRTResults = (results: any, model: string) => {
  if (!results || !results.itemParameters) {
    console.error('No IRT results to export');
    alert('No IRT results available to export. Please run the analysis first.');
    return;
  }

  try {
    const timestamp = new Date().toLocaleString();

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>IRT Analysis Report - ${model} Model</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
          line-height: 1.6;
        }
        h1 {
          color: #1e40af;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          margin-top: 30px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 8px;
        }
        h3 {
          color: #3b82f6;
          margin-top: 20px;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 20px 0;
          font-size: 13px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        .metric-container {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin: 20px 0;
        }
        .metric-box {
          flex: 0 0 calc(33.333% - 10px);
          padding: 15px 20px;
          border-radius: 8px;
          background-color: #eff6ff;
          border-left: 4px solid #3b82f6;
        }
        .metric-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 5px;
        }
        .metric-value {
          font-size: 24px;
          font-weight: bold;
          color: #1e40af;
        }
        .interpretation {
          background-color: #fef3c7;
          padding: 15px;
          border-radius: 8px;
          margin: 15px 0;
          border-left: 4px solid #f59e0b;
        }
        .guideline {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          margin: 15px 0;
          border-left: 4px solid #10b981;
        }
        .quality-excellent { color: #10b981; font-weight: bold; }
        .quality-good { color: #3b82f6; font-weight: bold; }
        .quality-acceptable { color: #f59e0b; font-weight: bold; }
        .quality-poor { color: #ef4444; font-weight: bold; }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        @media print {
          body { margin: 20px; }
          .metric-box { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      </style>
    </head>
    <body>
      <h1>Item Response Theory (IRT) Analysis Report</h1>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Advanced Psychometric Analysis</p>
      <p><strong>Model:</strong> ${model} (${model === '1PL' ? 'Rasch Model' : model === '2PL' ? 'Two-Parameter Logistic' : 'Three-Parameter Logistic'})</p>

      <div class="interpretation">
        <h3>Model Overview</h3>
        <p><strong>${model} Model</strong>: ${
          model === '1PL' ? 'Assumes all items have equal discrimination. Estimates only item difficulty (b parameter).' :
          model === '2PL' ? 'Estimates item difficulty (b) and discrimination (a). Suitable when items vary in their ability to differentiate between high and low ability examinees.' :
          'Estimates difficulty (b), discrimination (a), and guessing (c) parameters. Used when lower-ability examinees have a non-zero probability of guessing correctly.'
        }</p>
      </div>

      <h2>Sample Information</h2>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Number of Items</td>
          <td>${results.nItems || 0}</td>
        </tr>
        <tr>
          <td>Number of Respondents</td>
          <td>${results.nRespondents || 0}</td>
        </tr>
        <tr>
          <td>IRT Model</td>
          <td>${model}</td>
        </tr>
      </table>

      <h2>Model Fit Statistics</h2>
      <div class="metric-container">
        <div class="metric-box">
          <div class="metric-label">Log-Likelihood</div>
          <div class="metric-value">${results.modelFit?.logLikelihood?.toFixed(2) || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">AIC (Akaike Information Criterion)</div>
          <div class="metric-value">${results.modelFit?.aic?.toFixed(2) || 'N/A'}</div>
          <div class="metric-label">Lower is better</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">BIC (Bayesian Information Criterion)</div>
          <div class="metric-value">${results.modelFit?.bic?.toFixed(2) || 'N/A'}</div>
          <div class="metric-label">Lower is better</div>
        </div>
      </div>

      <div class="guideline">
        <h3>Model Fit Interpretation</h3>
        <ul>
          <li><strong>Log-Likelihood:</strong> Higher values indicate better fit</li>
          <li><strong>AIC & BIC:</strong> Lower values indicate better model fit. Use for comparing different models</li>
          <li><strong>Model Comparison:</strong> When comparing models, prefer the one with lower AIC/BIC</li>
        </ul>
      </div>

      <h2>Item Parameters</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Difficulty (b)</th>
            ${model !== '1PL' ? '<th>Discrimination (a)</th>' : ''}
            ${model === '3PL' ? '<th>Guessing (c)</th>' : ''}
            <th>Quality</th>
          </tr>
        </thead>
        <tbody>
          ${results.itemParameters.map((item: any) => `
            <tr>
              <td><strong>${item.name}</strong></td>
              <td>${typeof item.difficulty === 'number' ? item.difficulty.toFixed(3) : item.difficulty}</td>
              ${model !== '1PL' ? `<td>${typeof item.discrimination === 'number' ? item.discrimination.toFixed(3) : item.discrimination}</td>` : ''}
              ${model === '3PL' ? `<td>${typeof item.guessing === 'number' ? item.guessing.toFixed(3) : item.guessing}</td>` : ''}
              <td class="quality-${item.quality?.toLowerCase() || 'acceptable'}">${item.quality || 'N/A'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="guideline">
        <h3>Parameter Interpretation Guidelines</h3>
        <ul>
          <li><strong>Difficulty (b):</strong>
            <ul>
              <li>b = 0: Average difficulty</li>
              <li>b > 0: More difficult (requires higher ability)</li>
              <li>b < 0: Easier (requires lower ability)</li>
              <li>Typical range: -3 to +3</li>
            </ul>
          </li>
          ${model !== '1PL' ? `
          <li><strong>Discrimination (a):</strong>
            <ul>
              <li>a > 1.5: Excellent discrimination</li>
              <li>1.0 ≤ a ≤ 1.5: Good discrimination</li>
              <li>0.5 ≤ a < 1.0: Moderate discrimination</li>
              <li>a < 0.5: Poor discrimination (consider removing)</li>
            </ul>
          </li>
          ` : ''}
          ${model === '3PL' ? `
          <li><strong>Guessing (c):</strong>
            <ul>
              <li>c = 0: No guessing</li>
              <li>c ≈ 0.20-0.25: Typical for multiple-choice (4-5 options)</li>
              <li>c > 0.30: High guessing (may indicate item issues)</li>
            </ul>
          </li>
          ` : ''}
        </ul>
      </div>

      ${results.abilityEstimates ? `
      <h2>Ability Distribution Summary</h2>
      <table>
        <tr>
          <th>Statistic</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Mean Ability (θ)</td>
          <td>${(results.abilityEstimates.reduce((a: number, b: number) => a + b, 0) / results.abilityEstimates.length).toFixed(3)}</td>
        </tr>
        <tr>
          <td>SD of Ability</td>
          <td>${Math.sqrt(results.abilityEstimates.reduce((sum: number, val: number) => {
            const mean = results.abilityEstimates.reduce((a: number, b: number) => a + b, 0) / results.abilityEstimates.length;
            return sum + Math.pow(val - mean, 2);
          }, 0) / (results.abilityEstimates.length - 1)).toFixed(3)}</td>
        </tr>
        <tr>
          <td>Min Ability</td>
          <td>${Math.min(...results.abilityEstimates).toFixed(3)}</td>
        </tr>
        <tr>
          <td>Max Ability</td>
          <td>${Math.max(...results.abilityEstimates).toFixed(3)}</td>
        </tr>
      </table>
      ` : ''}

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform</p>
        <p>This report was automatically generated. Please verify results and consult with a psychometrician for critical decisions.</p>
        <p><strong>Key References:</strong></p>
        <ul style="font-size: 11px; margin-top: 10px;">
          <li>Embretson, S. E., & Reise, S. P. (2000). Item response theory for psychologists. Mahwah, NJ: Erlbaum.</li>
          <li>Baker, F. B., & Kim, S. H. (2004). Item response theory: Parameter estimation techniques (2nd ed.). New York: Marcel Dekker.</li>
          <li>De Ayala, R. J. (2009). The theory and practice of item response theory. New York: Guilford Press.</li>
          <li>Hambleton, R. K., Swaminathan, H., & Rogers, H. J. (1991). Fundamentals of item response theory. Newbury Park, CA: Sage.</li>
        </ul>
      </div>
    </body>
    </html>
  `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `IRT_${model}_Analysis_Report_${new Date().toISOString().split('T')[0]}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error('Error exporting IRT results:', error);
    alert('Error generating IRT report. Please try again.');
  }
};

export const exportTableToHTML = (
  tableData: any[],
  title: string,
  filename: string,
  additionalInfo?: { label: string; value: string | number }[]
) => {
  if (!tableData || tableData.length === 0) return;

  const headers = Object.keys(tableData[0]);
  const timestamp = new Date().toLocaleString();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
        }
        h1 {
          color: #1e40af;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 10px;
        }
        .info-box {
          background-color: #eff6ff;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .info-item {
          margin: 5px 0;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        tr:hover {
          background-color: #e5e7eb;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Advanced Psychometric Analysis</p>

      ${additionalInfo && additionalInfo.length > 0 ? `
        <div class="info-box">
          ${additionalInfo.map(info => `
            <div class="info-item">
              <strong>${info.label}:</strong> ${info.value}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <table>
        <thead>
          <tr>
            ${headers.map(header => `<th>${header}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${tableData.map(row => `
            <tr>
              ${headers.map(header => `<td>${row[header] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform</p>
        <p>This report was automatically generated. Please verify results and consult with a psychometrician for critical decisions.</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportTableToWord = (
  tableData: any[],
  title: string,
  filename: string,
  additionalInfo?: { label: string; value: string | number }[]
) => {
  if (!tableData || tableData.length === 0) return;

  const headers = Object.keys(tableData[0]);
  const timestamp = new Date().toLocaleString();

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body {
          font-family: Calibri, Arial, sans-serif;
          font-size: 11pt;
        }
        h1 {
          color: #1e40af;
          font-size: 18pt;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 10px;
        }
        .info-box {
          background-color: #eff6ff;
          padding: 10px;
          margin: 15px 0;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 15px 0;
        }
        th, td {
          border: 1px solid #000;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web</p>

      ${additionalInfo && additionalInfo.length > 0 ? `
        <div class="info-box">
          ${additionalInfo.map(info => `
            <p><strong>${info.label}:</strong> ${info.value}</p>
          `).join('')}
        </div>
      ` : ''}

      <table>
        <thead>
          <tr>
            ${headers.map(header => `<th>${header}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${tableData.map(row => `
            <tr>
              ${headers.map(header => `<td>${row[header] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>

      <p style="margin-top: 30px; font-size: 9pt; color: #6b7280;">
        <strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform<br>
        This report was automatically generated. Please verify results and consult with a psychometrician for critical decisions.
      </p>
    </body>
    </html>
  `;

  const blob = new Blob([wordContent], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportCanvasToPNG = (canvas: HTMLCanvasElement | null, filename: string) => {
  if (!canvas) return;

  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
};

export const exportScaleAnalysisToWord = (
  scaleName: string,
  validationResults: any,
  descriptives: any
) => {
  const timestamp = new Date().toLocaleString();

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${scaleName} - Psychometric Analysis Report</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body {
          font-family: Calibri, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.6;
        }
        h1 {
          color: #1e40af;
          font-size: 20pt;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 10px;
          margin-top: 0;
        }
        h2 {
          color: #2563eb;
          font-size: 16pt;
          margin-top: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 8px;
        }
        h3 {
          color: #3b82f6;
          font-size: 14pt;
          margin-top: 15px;
        }
        .metric-box {
          background-color: #eff6ff;
          padding: 15px;
          margin: 10px 0;
          border-left: 4px solid #3b82f6;
        }
        .metric-label {
          font-size: 9pt;
          color: #6b7280;
          font-weight: bold;
        }
        .metric-value {
          font-size: 16pt;
          font-weight: bold;
          color: #1e40af;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 15px 0;
        }
        th, td {
          border: 1px solid #000;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        .interpretation {
          background-color: #fef3c7;
          padding: 10px;
          margin: 10px 0;
          border-left: 4px solid #f59e0b;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
          font-size: 9pt;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <h1>${scaleName}</h1>
      <h2>Psychometric Analysis Report</h2>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Professional Psychometric Analysis</p>

      <h2>Executive Summary</h2>
      <div class="metric-box">
        <div class="metric-label">Sample Size (N)</div>
        <div class="metric-value">${descriptives.n || 'N/A'}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Cronbach's Alpha (α)</div>
        <div class="metric-value">${validationResults.reliability?.cronbach_alpha?.toFixed(3) || 'N/A'}</div>
        <div class="interpretation">
          ${validationResults.reliability?.cronbach_alpha >= 0.90 ? 'Excellent reliability (α ≥ 0.90)' :
            validationResults.reliability?.cronbach_alpha >= 0.80 ? 'Good reliability (α ≥ 0.80)' :
            validationResults.reliability?.cronbach_alpha >= 0.70 ? 'Acceptable reliability (α ≥ 0.70)' :
            'Below acceptable threshold (α < 0.70)'}
        </div>
      </div>
      <div class="metric-box">
        <div class="metric-label">McDonald's Omega (ω)</div>
        <div class="metric-value">${validationResults.reliability?.omega_total?.toFixed(3) || 'N/A'}</div>
      </div>

      <h2>Reliability Analysis</h2>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
          <th>Interpretation</th>
        </tr>
        <tr>
          <td>Cronbach's Alpha (α)</td>
          <td>${validationResults.reliability?.cronbach_alpha?.toFixed(3) || 'N/A'}</td>
          <td>${validationResults.reliability?.cronbach_alpha >= 0.90 ? 'Excellent' :
            validationResults.reliability?.cronbach_alpha >= 0.80 ? 'Good' :
            validationResults.reliability?.cronbach_alpha >= 0.70 ? 'Acceptable' : 'Poor'}</td>
        </tr>
        <tr>
          <td>McDonald's Omega (ω)</td>
          <td>${validationResults.reliability?.omega_total?.toFixed(3) || 'N/A'}</td>
          <td>${validationResults.reliability?.omega_total >= 0.90 ? 'Excellent' :
            validationResults.reliability?.omega_total >= 0.80 ? 'Good' :
            validationResults.reliability?.omega_total >= 0.70 ? 'Acceptable' : 'Poor'}</td>
        </tr>
        <tr>
          <td>Split-Half Reliability</td>
          <td>${validationResults.reliability?.split_half?.toFixed(3) || 'N/A'}</td>
          <td>Consistency between scale halves</td>
        </tr>
        <tr>
          <td>Standard Error of Measurement (SEM)</td>
          <td>${validationResults.reliability?.sem?.toFixed(3) || 'N/A'}</td>
          <td>Measurement precision</td>
        </tr>
      </table>

      <h2>Item Analysis</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Mean</th>
            <th>SD</th>
            <th>Item-Total Correlation</th>
            <th>α if Deleted</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          ${validationResults.itemAnalysis?.map((item: any) => `
            <tr>
              <td>${item.itemId}</td>
              <td>${item.mean?.toFixed(2)}</td>
              <td>${item.sd?.toFixed(2)}</td>
              <td><strong>${item.itemTotal?.toFixed(3)}</strong></td>
              <td>${item.alpha_if_deleted?.toFixed(3)}</td>
              <td>${item.itemTotal < 0.30 ? '⚠ Consider removing' :
                   item.itemTotal < 0.50 ? '⚠ Review item' :
                   '✓ Acceptable'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="interpretation">
        <strong>Item-Total Correlation Guidelines:</strong>
        <ul>
          <li>r ≥ 0.50: Excellent discrimination</li>
          <li>0.30 ≤ r < 0.50: Acceptable discrimination</li>
          <li>r < 0.30: Poor discrimination, consider revision or removal</li>
        </ul>
      </div>

      <h2>Descriptive Statistics</h2>
      <table>
        <tr>
          <th>Statistic</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Sample Size (N)</td>
          <td>${descriptives.n || 'N/A'}</td>
        </tr>
        <tr>
          <td>Mean (M)</td>
          <td>${descriptives.mean?.toFixed(2) || 'N/A'}</td>
        </tr>
        <tr>
          <td>Standard Deviation (SD)</td>
          <td>${descriptives.sd?.toFixed(2) || 'N/A'}</td>
        </tr>
        <tr>
          <td>Minimum Score</td>
          <td>${descriptives.min || 'N/A'}</td>
        </tr>
        <tr>
          <td>Maximum Score</td>
          <td>${descriptives.max || 'N/A'}</td>
        </tr>
      </table>

      <h2>Normative Data (Percentiles)</h2>
      <table>
        <thead>
          <tr>
            <th>Percentile</th>
            <th>Raw Score</th>
            <th>Classification</th>
          </tr>
        </thead>
        <tbody>
          ${validationResults.percentiles ? Object.entries(validationResults.percentiles).map(([p, score]: [string, any]) => `
            <tr>
              <td>${p}th</td>
              <td>${typeof score === 'number' ? score.toFixed(1) : score}</td>
              <td>${p === '95' ? 'Very High' : p === '75' ? 'High' : p === '50' ? 'Average' : p === '25' ? 'Low' : p === '5' ? 'Very Low' : ''}</td>
            </tr>
          `).join('') : '<tr><td colspan="3">No percentile data available</td></tr>'}
        </tbody>
      </table>

      <h2>Recommendations</h2>
      <div class="interpretation">
        <h3>Scale Quality</h3>
        <ul>
          ${validationResults.reliability?.cronbach_alpha >= 0.80
            ? '<li>✓ The scale demonstrates good to excellent internal consistency.</li>'
            : '<li>⚠ Consider item revision to improve reliability.</li>'}
          ${validationResults.itemAnalysis?.some((item: any) => item.itemTotal < 0.30)
            ? '<li>⚠ Some items show poor discrimination and should be reviewed.</li>'
            : '<li>✓ All items demonstrate acceptable discrimination.</li>'}
          ${descriptives.n >= 300
            ? '<li>✓ Sample size is adequate for reliable psychometric analysis.</li>'
            : descriptives.n >= 100
            ? '<li>✓ Sample size is acceptable but larger samples recommended for confirmatory analyses.</li>'
            : '<li>⚠ Sample size is small; collect more data for robust conclusions.</li>'}
        </ul>

        <h3>Next Steps</h3>
        <ul>
          <li>Conduct confirmatory factor analysis (CFA) to examine construct validity</li>
          <li>Test measurement invariance across relevant groups</li>
          <li>Establish convergent and discriminant validity</li>
          <li>Develop norms for target population</li>
          <li>Test criterion-related validity</li>
        </ul>
      </div>

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform</p>
        <p>This report was automatically generated using professional psychometric standards.</p>
        <p><strong>References:</strong></p>
        <ul style="margin-top: 5px;">
          <li>Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297-334.</li>
          <li>McDonald, R. P. (1999). Test theory: A unified treatment. Mahwah, NJ: Lawrence Erlbaum Associates.</li>
          <li>Nunnally, J. C., & Bernstein, I. H. (1994). Psychometric theory (3rd ed.). New York: McGraw-Hill.</li>
          <li>DeVellis, R. F. (2017). Scale development: Theory and applications (4th ed.). Thousand Oaks, CA: Sage.</li>
        </ul>
        <p><strong>Note:</strong> This analysis should be interpreted by qualified psychometricians. Consult relevant ethical guidelines and professional standards for test development and validation.</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([wordContent], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${scaleName.replace(/\s+/g, '_')}_Psychometric_Report_${new Date().toISOString().split('T')[0]}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportScaleAnalysisToHTML = (
  scaleName: string,
  validationResults: any,
  descriptives: any
) => {
  const timestamp = new Date().toLocaleString();

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${scaleName} - Psychometric Analysis Report</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          background-color: #f9fafb;
        }
        .container {
          background-color: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: #1e40af;
          font-size: 32px;
          border-bottom: 4px solid #1e40af;
          padding-bottom: 15px;
          margin-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          font-size: 24px;
          margin-top: 40px;
          margin-bottom: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 10px;
        }
        h3 {
          color: #3b82f6;
          font-size: 18px;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        .header-info {
          background-color: #eff6ff;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin: 30px 0;
        }
        .metric-box {
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          padding: 25px;
          border-radius: 10px;
          border-left: 5px solid #3b82f6;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .metric-label {
          font-size: 13px;
          color: #6b7280;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .metric-value {
          font-size: 36px;
          font-weight: bold;
          color: #1e40af;
          line-height: 1;
        }
        .metric-interpretation {
          font-size: 14px;
          color: #374151;
          margin-top: 8px;
          font-weight: 500;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background-color: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        th, td {
          padding: 14px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        th {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: 0.5px;
        }
        tr:hover {
          background-color: #f9fafb;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        .interpretation-box {
          background-color: #fef3c7;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 5px solid #f59e0b;
        }
        .interpretation-box h3 {
          color: #92400e;
          margin-top: 0;
        }
        .interpretation-box ul {
          margin-left: 20px;
          margin-top: 10px;
        }
        .interpretation-box li {
          margin: 8px 0;
          color: #78350f;
        }
        .footer {
          margin-top: 60px;
          padding-top: 30px;
          border-top: 2px solid #e5e7eb;
          font-size: 13px;
          color: #6b7280;
        }
        .footer ul {
          margin-left: 20px;
          margin-top: 10px;
        }
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .badge-success { background-color: #d1fae5; color: #065f46; }
        .badge-warning { background-color: #fef3c7; color: #92400e; }
        .badge-danger { background-color: #fee2e2; color: #991b1b; }
        @media print {
          body { background-color: white; }
          .container { box-shadow: none; }
        }
        @media (max-width: 768px) {
          .metric-grid { grid-template-columns: 1fr; }
          .container { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${scaleName}</h1>
        <p style="font-size: 18px; color: #6b7280; margin-bottom: 30px;">Comprehensive Psychometric Analysis Report</p>

        <div class="header-info">
          <p><strong>Generated:</strong> ${timestamp}</p>
          <p><strong>Platform:</strong> Psychtrix Web - Professional Psychometric Analysis</p>
          <p><strong>Analysis Type:</strong> Classical Test Theory (CTT) & Reliability Analysis</p>
        </div>

        <h2>📊 Executive Summary</h2>
        <div class="metric-grid">
          <div class="metric-box">
            <div class="metric-label">Sample Size</div>
            <div class="metric-value">${descriptives.n || 'N/A'}</div>
            <div class="metric-interpretation">
              ${descriptives.n >= 300 ? '✓ Excellent sample' :
                descriptives.n >= 100 ? '✓ Adequate sample' : '⚠ Small sample'}
            </div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Cronbach's Alpha (α)</div>
            <div class="metric-value">${validationResults.reliability?.cronbach_alpha?.toFixed(3) || 'N/A'}</div>
            <div class="metric-interpretation">
              ${validationResults.reliability?.cronbach_alpha >= 0.90 ? '✓ Excellent' :
                validationResults.reliability?.cronbach_alpha >= 0.80 ? '✓ Good' :
                validationResults.reliability?.cronbach_alpha >= 0.70 ? '⚠ Acceptable' : '✗ Poor'}
            </div>
          </div>
          <div class="metric-box">
            <div class="metric-label">McDonald's Omega (ω)</div>
            <div class="metric-value">${validationResults.reliability?.omega_total?.toFixed(3) || 'N/A'}</div>
            <div class="metric-interpretation">Composite reliability</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Split-Half Reliability</div>
            <div class="metric-value">${validationResults.reliability?.split_half?.toFixed(3) || 'N/A'}</div>
            <div class="metric-interpretation">Between-halves consistency</div>
          </div>
        </div>

        <h2>🔍 Reliability Analysis</h2>
        <table>
          <thead>
            <tr>
              <th>Reliability Metric</th>
              <th>Value</th>
              <th>Interpretation</th>
              <th>Standard</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Cronbach's Alpha (α)</strong></td>
              <td>${validationResults.reliability?.cronbach_alpha?.toFixed(3) || 'N/A'}</td>
              <td>
                ${validationResults.reliability?.cronbach_alpha >= 0.90
                  ? '<span class="badge badge-success">Excellent</span>' :
                  validationResults.reliability?.cronbach_alpha >= 0.80
                  ? '<span class="badge badge-success">Good</span>' :
                  validationResults.reliability?.cronbach_alpha >= 0.70
                  ? '<span class="badge badge-warning">Acceptable</span>' :
                  '<span class="badge badge-danger">Poor</span>'}
              </td>
              <td>≥ 0.70 acceptable, ≥ 0.80 good, ≥ 0.90 excellent</td>
            </tr>
            <tr>
              <td><strong>McDonald's Omega (ω)</strong></td>
              <td>${validationResults.reliability?.omega_total?.toFixed(3) || 'N/A'}</td>
              <td>
                ${validationResults.reliability?.omega_total >= 0.80
                  ? '<span class="badge badge-success">Good</span>' :
                  '<span class="badge badge-warning">Acceptable</span>'}
              </td>
              <td>More robust than alpha for multidimensional scales</td>
            </tr>
            <tr>
              <td><strong>Split-Half Reliability</strong></td>
              <td>${validationResults.reliability?.split_half?.toFixed(3) || 'N/A'}</td>
              <td>Consistency check</td>
              <td>Should approximate alpha value</td>
            </tr>
            <tr>
              <td><strong>SEM (Standard Error)</strong></td>
              <td>${validationResults.reliability?.sem?.toFixed(3) || 'N/A'}</td>
              <td>Measurement precision</td>
              <td>Lower values indicate better precision</td>
            </tr>
          </tbody>
        </table>

        <h2>📝 Item Analysis</h2>
        <table>
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Mean</th>
              <th>SD</th>
              <th>Item-Total r</th>
              <th>α if Deleted</th>
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>
            ${validationResults.itemAnalysis?.map((item: any) => `
              <tr>
                <td><strong>${item.itemId}</strong></td>
                <td>${item.mean?.toFixed(2)}</td>
                <td>${item.sd?.toFixed(2)}</td>
                <td><strong>${item.itemTotal?.toFixed(3)}</strong></td>
                <td>${item.alpha_if_deleted?.toFixed(3)}</td>
                <td>
                  ${item.itemTotal >= 0.50
                    ? '<span class="badge badge-success">✓ Excellent</span>' :
                    item.itemTotal >= 0.30
                    ? '<span class="badge badge-warning">⚠ Acceptable</span>' :
                    '<span class="badge badge-danger">✗ Poor</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="interpretation-box">
          <h3>Item-Total Correlation Interpretation</h3>
          <ul>
            <li><strong>r ≥ 0.50:</strong> Excellent item discrimination - item strongly relates to total scale</li>
            <li><strong>0.30 ≤ r < 0.50:</strong> Acceptable discrimination - item adequately relates to scale</li>
            <li><strong>r < 0.30:</strong> Poor discrimination - consider item revision or removal</li>
            <li><strong>Negative r:</strong> Item may be reverse-coded or measuring different construct</li>
          </ul>
        </div>

        <h2>📈 Descriptive Statistics</h2>
        <table>
          <thead>
            <tr>
              <th>Statistic</th>
              <th>Value</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Sample Size (N)</strong></td>
              <td>${descriptives.n || 'N/A'}</td>
              <td>Number of valid responses</td>
            </tr>
            <tr>
              <td><strong>Mean (M)</strong></td>
              <td>${descriptives.mean?.toFixed(2) || 'N/A'}</td>
              <td>Average scale score</td>
            </tr>
            <tr>
              <td><strong>Standard Deviation (SD)</strong></td>
              <td>${descriptives.sd?.toFixed(2) || 'N/A'}</td>
              <td>Score variability</td>
            </tr>
            <tr>
              <td><strong>Minimum Score</strong></td>
              <td>${descriptives.min || 'N/A'}</td>
              <td>Lowest observed score</td>
            </tr>
            <tr>
              <td><strong>Maximum Score</strong></td>
              <td>${descriptives.max || 'N/A'}</td>
              <td>Highest observed score</td>
            </tr>
          </tbody>
        </table>

        <h2>📊 Normative Data (Percentile Ranks)</h2>
        <table>
          <thead>
            <tr>
              <th>Percentile</th>
              <th>Raw Score</th>
              <th>Classification</th>
              <th>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            ${validationResults.percentiles ? Object.entries(validationResults.percentiles).map(([p, score]: [string, any]) => {
              let classification = '';
              let interpretation = '';
              if (p === '95') {
                classification = 'Very High';
                interpretation = 'Top 5% of scores';
              } else if (p === '90') {
                classification = 'High';
                interpretation = 'Top 10% of scores';
              } else if (p === '75') {
                classification = 'Above Average';
                interpretation = 'Upper quartile';
              } else if (p === '50') {
                classification = 'Average';
                interpretation = 'Median score';
              } else if (p === '25') {
                classification = 'Below Average';
                interpretation = 'Lower quartile';
              } else if (p === '10') {
                classification = 'Low';
                interpretation = 'Bottom 10% of scores';
              } else if (p === '5') {
                classification = 'Very Low';
                interpretation = 'Bottom 5% of scores';
              }
              return `
                <tr>
                  <td><strong>${p}th</strong></td>
                  <td>${typeof score === 'number' ? score.toFixed(1) : score}</td>
                  <td><strong>${classification}</strong></td>
                  <td>${interpretation}</td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="4" style="text-align:center;">No percentile data available - collect more responses</td></tr>'}
          </tbody>
        </table>

        <div class="interpretation-box">
          <h3>🎯 Scale Quality Summary</h3>
          <ul>
            ${validationResults.reliability?.cronbach_alpha >= 0.80
              ? '<li><strong>✓ Excellent Internal Consistency:</strong> The scale demonstrates good to excellent reliability, indicating items consistently measure the same construct.</li>'
              : '<li><strong>⚠ Reliability Concerns:</strong> Consider item revision, increasing item count, or reviewing scale instructions to improve consistency.</li>'}
            ${validationResults.itemAnalysis?.every((item: any) => item.itemTotal >= 0.30)
              ? '<li><strong>✓ Strong Item Quality:</strong> All items demonstrate acceptable or better discrimination.</li>'
              : '<li><strong>⚠ Item Quality Issues:</strong> Some items show poor discrimination (r < 0.30) and should be reviewed, revised, or removed.</li>'}
            ${descriptives.n >= 300
              ? '<li><strong>✓ Robust Sample Size:</strong> Sample size exceeds recommended minimums for reliable psychometric analysis (n ≥ 300).</li>'
              : descriptives.n >= 100
              ? '<li><strong>✓ Adequate Sample:</strong> Sample size is acceptable (n ≥ 100) but larger samples (n ≥ 300) recommended for robust conclusions.</li>'
              : '<li><strong>⚠ Small Sample:</strong> Current sample size (n < 100) may limit reliability of findings. Continue data collection.</li>'}
          </ul>
        </div>

        <div class="interpretation-box">
          <h3>🔬 Recommended Next Steps</h3>
          <ol>
            <li><strong>Validity Testing:</strong>
              <ul>
                <li>Conduct Confirmatory Factor Analysis (CFA) to verify theoretical structure</li>
                <li>Test convergent validity with theoretically related measures</li>
                <li>Test discriminant validity with theoretically distinct measures</li>
                <li>Assess criterion-related validity (concurrent and predictive)</li>
              </ul>
            </li>
            <li><strong>Measurement Invariance:</strong>
              <ul>
                <li>Test configural, metric, and scalar invariance across relevant groups</li>
                <li>Ensure scale functions equivalently for all intended populations</li>
              </ul>
            </li>
            <li><strong>Norm Development:</strong>
              <ul>
                <li>Collect larger, representative samples for robust norms</li>
                <li>Develop age, gender, and culture-specific norms as appropriate</li>
              </ul>
            </li>
            <li><strong>Clinical Utility:</strong>
              <ul>
                <li>Establish clinical cutoff scores if applicable</li>
                <li>Calculate sensitivity and specificity for diagnostic purposes</li>
                <li>Test responsiveness to change for longitudinal applications</li>
              </ul>
            </li>
          </ol>
        </div>

        <div class="footer">
          <p><strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform</p>
          <p>© ${new Date().getFullYear()} Psychtrix Innovative. All rights reserved.</p>

          <h3 style="margin-top: 20px; color: #1e40af;">Key References</h3>
          <ul>
            <li>Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. <em>Psychometrika, 16</em>(3), 297-334.</li>
            <li>McDonald, R. P. (1999). <em>Test theory: A unified treatment</em>. Mahwah, NJ: Lawrence Erlbaum Associates.</li>
            <li>Nunnally, J. C., & Bernstein, I. H. (1994). <em>Psychometric theory</em> (3rd ed.). New York: McGraw-Hill.</li>
            <li>DeVellis, R. F. (2017). <em>Scale development: Theory and applications</em> (4th ed.). Thousand Oaks, CA: Sage.</li>
            <li>Kline, P. (2000). <em>The handbook of psychological testing</em> (2nd ed.). London: Routledge.</li>
            <li>American Educational Research Association, American Psychological Association, & National Council on Measurement in Education. (2014). <em>Standards for educational and psychological testing</em>. Washington, DC: AERA.</li>
          </ul>

          <p style="margin-top: 20px;"><strong>Important Note:</strong> This analysis follows established psychometric standards and best practices. Results should be interpreted by qualified researchers or psychometricians. Consult relevant ethical guidelines (e.g., APA Ethics Code) and professional standards when developing and using psychological assessments.</p>

          <p style="margin-top: 15px; font-style: italic;">For questions or support, contact: support@psychtrixinnovative.com</p>
        </div>
      </div>

      <script>
        window.print = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${scaleName.replace(/\s+/g, '_')}_Psychometric_Report_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportCulturalAdaptationToWord = (
  studyName: string,
  difResults: any[],
  invarianceResults: any,
  groupComparisons: any
) => {
  const timestamp = new Date().toLocaleString();

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${studyName} - Cultural Adaptation & DIF Analysis</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body {
          font-family: Calibri, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.6;
        }
        h1 {
          color: #1e40af;
          font-size: 20pt;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 10px;
          margin-top: 0;
        }
        h2 {
          color: #2563eb;
          font-size: 16pt;
          margin-top: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 8px;
        }
        h3 {
          color: #3b82f6;
          font-size: 14pt;
          margin-top: 15px;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 15px 0;
        }
        th, td {
          border: 1px solid #000;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        .metric-box {
          background-color: #eff6ff;
          padding: 15px;
          margin: 10px 0;
          border-left: 4px solid #3b82f6;
        }
        .interpretation {
          background-color: #fef3c7;
          padding: 10px;
          margin: 10px 0;
          border-left: 4px solid #f59e0b;
        }
        .warning {
          background-color: #fee2e2;
          padding: 10px;
          margin: 10px 0;
          border-left: 4px solid #dc2626;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
          font-size: 9pt;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <h1>${studyName}</h1>
      <h2>Cultural Adaptation & Cross-Cultural Validation Report</h2>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Professional Cross-Cultural Analysis</p>

      <h2>Executive Summary</h2>
      <div class="metric-box">
        <p><strong>Analysis Type:</strong> Differential Item Functioning (DIF) & Measurement Invariance</p>
        <p><strong>Groups Compared:</strong> ${groupComparisons?.focalGroup || 'N/A'} vs ${groupComparisons?.referenceGroup || 'N/A'}</p>
        <p><strong>Items Analyzed:</strong> ${difResults?.length || 0}</p>
        <p><strong>DIF Items Detected:</strong> ${difResults?.filter((r: any) => r.classification !== 'negligible').length || 0}</p>
      </div>

      <h2>Differential Item Functioning (DIF) Analysis</h2>
      <p>DIF analysis identifies items that function differently across cultural or linguistic groups,
      even when individuals have the same underlying trait level.</p>

      <h3>DIF Results by Item</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>DIF Magnitude</th>
            <th>Effect Size</th>
            <th>p-value</th>
            <th>Classification</th>
            <th>Interpretation</th>
          </tr>
        </thead>
        <tbody>
          ${difResults?.map((item: any) => `
            <tr>
              <td><strong>${item.itemName || item.itemIndex}</strong></td>
              <td>${item.difMagnitude?.toFixed(3) || 'N/A'}</td>
              <td>${item.effectSize?.toFixed(3) || 'N/A'}</td>
              <td>${item.pValue?.toFixed(4) || 'N/A'}</td>
              <td><strong>${item.classification || 'N/A'}</strong></td>
              <td>${item.interpretation || 'N/A'}</td>
            </tr>
          `).join('') || '<tr><td colspan="6">No DIF results available</td></tr>'}
        </tbody>
      </table>

      <div class="interpretation">
        <h3>DIF Classification Guidelines (ETS Standards)</h3>
        <ul>
          <li><strong>Negligible (A):</strong> No meaningful DIF detected; item functions equivalently</li>
          <li><strong>Moderate (B):</strong> Some DIF present; review item but may be acceptable</li>
          <li><strong>Large (C):</strong> Substantial DIF; item should be revised or removed</li>
        </ul>
        <p><strong>Statistical Criteria:</strong></p>
        <ul>
          <li>Mantel-Haenszel: |MH D-DIF| > 1.5 indicates large DIF</li>
          <li>Logistic Regression: ΔR² > 0.035 (moderate), > 0.070 (large)</li>
        </ul>
      </div>

      ${invarianceResults ? `
        <h2>Measurement Invariance Testing</h2>
        <p>Measurement invariance tests whether the scale has the same measurement properties across groups,
        progressing through increasingly stringent levels.</p>

        <h3>Invariance Test Results</h3>
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>χ²</th>
              <th>df</th>
              <th>CFI</th>
              <th>RMSEA</th>
              <th>ΔCFI</th>
              <th>ΔRMSEA</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            ${invarianceResults.configural ? `
              <tr>
                <td><strong>Configural</strong></td>
                <td>${invarianceResults.configural.chisq?.toFixed(2)}</td>
                <td>${invarianceResults.configural.df}</td>
                <td>${invarianceResults.configural.cfi?.toFixed(3)}</td>
                <td>${invarianceResults.configural.rmsea?.toFixed(3)}</td>
                <td>-</td>
                <td>-</td>
                <td>${invarianceResults.configural.conclusion || 'N/A'}</td>
              </tr>
            ` : ''}
            ${invarianceResults.metric ? `
              <tr>
                <td><strong>Metric</strong></td>
                <td>${invarianceResults.metric.chisq?.toFixed(2)}</td>
                <td>${invarianceResults.metric.df}</td>
                <td>${invarianceResults.metric.cfi?.toFixed(3)}</td>
                <td>${invarianceResults.metric.rmsea?.toFixed(3)}</td>
                <td>${invarianceResults.metric.deltaCFI?.toFixed(3) || 'N/A'}</td>
                <td>${invarianceResults.metric.deltaRMSEA?.toFixed(3) || 'N/A'}</td>
                <td>${invarianceResults.metric.conclusion || 'N/A'}</td>
              </tr>
            ` : ''}
            ${invarianceResults.scalar ? `
              <tr>
                <td><strong>Scalar</strong></td>
                <td>${invarianceResults.scalar.chisq?.toFixed(2)}</td>
                <td>${invarianceResults.scalar.df}</td>
                <td>${invarianceResults.scalar.cfi?.toFixed(3)}</td>
                <td>${invarianceResults.scalar.rmsea?.toFixed(3)}</td>
                <td>${invarianceResults.scalar.deltaCFI?.toFixed(3) || 'N/A'}</td>
                <td>${invarianceResults.scalar.deltaRMSEA?.toFixed(3) || 'N/A'}</td>
                <td>${invarianceResults.scalar.conclusion || 'N/A'}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>

        <div class="interpretation">
          <h3>Invariance Level Interpretations</h3>
          <ul>
            <li><strong>Configural Invariance:</strong> Same factor structure across groups</li>
            <li><strong>Metric Invariance:</strong> Same factor loadings (intervals comparable)</li>
            <li><strong>Scalar Invariance:</strong> Same intercepts (means comparable)</li>
            <li><strong>Strict Invariance:</strong> Same residual variances (full equivalence)</li>
          </ul>
          <p><strong>Decision Criteria (Cheung & Rensvold, 2002):</strong></p>
          <ul>
            <li>ΔCFI ≤ -0.010 indicates invariance is supported</li>
            <li>ΔRMSEA ≤ 0.015 indicates invariance is supported</li>
            <li>Both criteria should be met to proceed to next level</li>
          </ul>
        </div>
      ` : ''}

      <h2>Group Comparisons</h2>
      ${groupComparisons ? `
        <h3>Descriptive Statistics by Group</h3>
        <table>
          <tr>
            <th>Metric</th>
            <th>${groupComparisons.focalGroup || 'Focal Group'}</th>
            <th>${groupComparisons.referenceGroup || 'Reference Group'}</th>
            <th>Difference</th>
          </tr>
          <tr>
            <td><strong>Sample Size (N)</strong></td>
            <td>${groupComparisons.focalN || 'N/A'}</td>
            <td>${groupComparisons.referenceN || 'N/A'}</td>
            <td>-</td>
          </tr>
          <tr>
            <td><strong>Mean Score</strong></td>
            <td>${groupComparisons.focalMean?.toFixed(2) || 'N/A'}</td>
            <td>${groupComparisons.referenceMean?.toFixed(2) || 'N/A'}</td>
            <td>${groupComparisons.meanDifference?.toFixed(2) || 'N/A'}</td>
          </tr>
          <tr>
            <td><strong>Standard Deviation</strong></td>
            <td>${groupComparisons.focalSD?.toFixed(2) || 'N/A'}</td>
            <td>${groupComparisons.referenceSD?.toFixed(2) || 'N/A'}</td>
            <td>-</td>
          </tr>
          <tr>
            <td><strong>Cohen's d</strong></td>
            <td colspan="2" style="text-align: center;">${groupComparisons.cohensD?.toFixed(3) || 'N/A'}</td>
            <td>${groupComparisons.cohensD && Math.abs(groupComparisons.cohensD) < 0.2 ? 'Small' :
                 groupComparisons.cohensD && Math.abs(groupComparisons.cohensD) < 0.5 ? 'Medium' : 'Large'}</td>
          </tr>
        </table>

        <div class="interpretation">
          <h3>Effect Size Interpretation (Cohen, 1988)</h3>
          <ul>
            <li><strong>Small effect:</strong> |d| = 0.20 - Subtle difference</li>
            <li><strong>Medium effect:</strong> |d| = 0.50 - Noticeable difference</li>
            <li><strong>Large effect:</strong> |d| = 0.80 - Substantial difference</li>
          </ul>
        </div>
      ` : ''}

      <h2>Recommendations</h2>
      <div class="interpretation">
        <h3>Scale Adaptation Quality</h3>
        <ul>
          ${difResults?.filter((r: any) => r.classification === 'large').length > 0
            ? '<li><strong>⚠ ACTION REQUIRED:</strong> Items with large DIF should be reviewed for cultural bias, mistranslation, or conceptual non-equivalence.</li>'
            : '<li><strong>✓ DIF ACCEPTABLE:</strong> No items show large DIF; cultural adaptation appears successful.</li>'}
          ${invarianceResults?.scalar?.conclusion === 'supported'
            ? '<li><strong>✓ SCALAR INVARIANCE ACHIEVED:</strong> Mean comparisons between groups are valid and meaningful.</li>'
            : invarianceResults?.metric?.conclusion === 'supported'
            ? '<li><strong>⚠ PARTIAL INVARIANCE:</strong> Correlation patterns comparable but mean comparisons may be problematic.</li>'
            : '<li><strong>⚠ LIMITED INVARIANCE:</strong> Consider major revision of culturally problematic items.</li>'}
        </ul>

        <h3>Next Steps for Cross-Cultural Validation</h3>
        <ol>
          <li><strong>Review Flagged Items:</strong> Examine items with moderate/large DIF for cultural appropriateness</li>
          <li><strong>Expert Review:</strong> Consult cultural experts and translators about problematic items</li>
          <li><strong>Cognitive Interviews:</strong> Conduct think-aloud interviews to understand item interpretation</li>
          <li><strong>Back-Translation:</strong> Verify translation quality and conceptual equivalence</li>
          <li><strong>Partial Invariance:</strong> If full invariance not achieved, test partial invariance models</li>
          <li><strong>Establish Group Norms:</strong> Develop culture-specific norms if scalar invariance not supported</li>
        </ol>
      </div>

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Cross-Cultural Psychometric Analysis</p>
        <p>This report follows international standards for cross-cultural adaptation and validation.</p>
        <p><strong>Key References:</strong></p>
        <ul style="margin-top: 5px;">
          <li>Cheung, G. W., & Rensvold, R. B. (2002). Evaluating goodness-of-fit indexes for testing measurement invariance. <em>Structural Equation Modeling, 9</em>(2), 233-255.</li>
          <li>Zumbo, B. D. (1999). A handbook on the theory and methods of differential item functioning (DIF). Ottawa: Directorate of Human Resources Research and Evaluation, Department of National Defense.</li>
          <li>Vandenberg, R. J., & Lance, C. E. (2000). A review and synthesis of the measurement invariance literature. <em>Organizational Research Methods, 3</em>(1), 4-70.</li>
          <li>Beaton, D. E., et al. (2000). Guidelines for the process of cross-cultural adaptation of self-report measures. <em>Spine, 25</em>(24), 3186-3191.</li>
          <li>International Test Commission (2017). <em>ITC Guidelines for Translating and Adapting Tests</em> (2nd ed.).</li>
        </ul>
        <p><strong>Note:</strong> Cross-cultural adaptation requires expertise in both psychometrics and cultural psychology. Consult with cross-cultural measurement specialists for critical applications.</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([wordContent], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_Cultural_Adaptation_${new Date().toISOString().split('T')[0]}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportCulturalAdaptationToHTML = (
  studyName: string,
  difResults: any[],
  invarianceResults: any,
  groupComparisons: any
) => {
  const timestamp = new Date().toLocaleString();

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${studyName} - Cultural Adaptation Analysis</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background-color: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        h1 {
          color: #1e40af;
          font-size: 32px;
          border-bottom: 4px solid #1e40af;
          padding-bottom: 15px;
          margin-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          font-size: 24px;
          margin-top: 40px;
          margin-bottom: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 10px;
        }
        h3 {
          color: #3b82f6;
          font-size: 18px;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        .header-info {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 30px 0;
        }
        .metric-box {
          background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
          padding: 25px;
          border-radius: 10px;
          border-left: 5px solid #667eea;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transition: transform 0.3s;
        }
        .metric-box:hover {
          transform: translateY(-5px);
        }
        .metric-label {
          font-size: 13px;
          color: #4b5563;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .metric-value {
          font-size: 36px;
          font-weight: bold;
          color: #667eea;
          line-height: 1;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background-color: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        th, td {
          padding: 14px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        th {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: 0.5px;
        }
        tr:hover {
          background-color: #f9fafb;
        }
        tr:nth-child(even) {
          background-color: #f3f4f6;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .badge-success { background-color: #d1fae5; color: #065f46; }
        .badge-warning { background-color: #fef3c7; color: #92400e; }
        .badge-danger { background-color: #fee2e2; color: #991b1b; }
        .interpretation-box {
          background-color: #fef3c7;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 5px solid #f59e0b;
        }
        .interpretation-box h3 {
          color: #92400e;
          margin-top: 0;
        }
        .interpretation-box ul {
          margin-left: 20px;
          margin-top: 10px;
        }
        .interpretation-box li {
          margin: 8px 0;
          color: #78350f;
        }
        .warning-box {
          background-color: #fee2e2;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 5px solid #dc2626;
        }
        .warning-box h3 {
          color: #991b1b;
          margin-top: 0;
        }
        .footer {
          margin-top: 60px;
          padding-top: 30px;
          border-top: 2px solid #e5e7eb;
          font-size: 13px;
          color: #6b7280;
        }
        .footer ul {
          margin-left: 20px;
          margin-top: 10px;
        }
        @media print {
          body { background: white; }
          .container { box-shadow: none; }
        }
        @media (max-width: 768px) {
          .metric-grid { grid-template-columns: 1fr; }
          .container { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${studyName}</h1>
        <p style="font-size: 18px; color: #6b7280; margin-bottom: 30px;">Cross-Cultural Adaptation & DIF Analysis Report</p>

        <div class="header-info">
          <p><strong>Generated:</strong> ${timestamp}</p>
          <p><strong>Platform:</strong> Psychtrix Web - Professional Cross-Cultural Psychometric Analysis</p>
          <p><strong>Analysis Type:</strong> Differential Item Functioning (DIF) & Measurement Invariance Testing</p>
        </div>

        <h2>🌍 Executive Summary</h2>
        <div class="metric-grid">
          <div class="metric-box">
            <div class="metric-label">Groups Compared</div>
            <div class="metric-value">2</div>
            <div style="margin-top: 8px; font-size: 14px; color: #4b5563;">
              ${groupComparisons?.focalGroup || 'Focal'} vs ${groupComparisons?.referenceGroup || 'Reference'}
            </div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Items Analyzed</div>
            <div class="metric-value">${difResults?.length || 0}</div>
            <div style="margin-top: 8px; font-size: 14px; color: #4b5563;">
              Total items tested
            </div>
          </div>
          <div class="metric-box">
            <div class="metric-label">DIF Items</div>
            <div class="metric-value">${difResults?.filter((r: any) => r.classification !== 'negligible').length || 0}</div>
            <div style="margin-top: 8px; font-size: 14px; color: #4b5563;">
              Flagged for review
            </div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Effect Size</div>
            <div class="metric-value">${groupComparisons?.cohensD?.toFixed(2) || 'N/A'}</div>
            <div style="margin-top: 8px; font-size: 14px; color: #4b5563;">
              Cohen's d
            </div>
          </div>
        </div>

        <h2>📊 Differential Item Functioning (DIF) Analysis</h2>
        <p>DIF analysis identifies items that function differently across cultural or linguistic groups, even when individuals have the same underlying trait level. This is critical for ensuring fair and unbiased cross-cultural assessment.</p>

        <h3>DIF Results by Item</h3>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>DIF Magnitude</th>
              <th>Effect Size</th>
              <th>p-value</th>
              <th>Classification</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${difResults?.map((item: any) => `
              <tr>
                <td><strong>${item.itemName || `Item ${item.itemIndex + 1}`}</strong></td>
                <td>${item.difMagnitude?.toFixed(3) || 'N/A'}</td>
                <td>${item.effectSize?.toFixed(3) || 'N/A'}</td>
                <td>${item.pValue?.toFixed(4) || 'N/A'}</td>
                <td><strong>${item.classification || 'N/A'}</strong></td>
                <td>
                  ${item.classification === 'negligible'
                    ? '<span class="badge badge-success">✓ Acceptable</span>'
                    : item.classification === 'moderate'
                    ? '<span class="badge badge-warning">⚠ Review</span>'
                    : '<span class="badge badge-danger">✗ Revise</span>'}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" style="text-align:center;">No DIF results available</td></tr>'}
          </tbody>
        </table>

        <div class="interpretation-box">
          <h3>DIF Classification Guidelines (ETS Standards)</h3>
          <ul>
            <li><strong>Negligible (A):</strong> No meaningful DIF detected; item functions equivalently across groups</li>
            <li><strong>Moderate (B):</strong> Some DIF present; review item content but may be acceptable for use</li>
            <li><strong>Large (C):</strong> Substantial DIF detected; item should be revised or removed from scale</li>
          </ul>
          <p><strong>Statistical Criteria:</strong></p>
          <ul>
            <li>Mantel-Haenszel: |MH D-DIF| > 1.0 indicates moderate DIF, > 1.5 indicates large DIF</li>
            <li>Logistic Regression: ΔR² > 0.035 (moderate DIF), > 0.070 (large DIF)</li>
          </ul>
        </div>

        ${invarianceResults ? `
          <h2>🔬 Measurement Invariance Testing</h2>
          <p>Measurement invariance examines whether the scale has equivalent measurement properties across cultural groups. Testing proceeds through hierarchical levels, each adding constraints:</p>

          <h3>Invariance Test Results</h3>
          <table>
            <thead>
              <tr>
                <th>Invariance Level</th>
                <th>χ²</th>
                <th>df</th>
                <th>CFI</th>
                <th>RMSEA</th>
                <th>ΔCFI</th>
                <th>ΔRMSEA</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              ${invarianceResults.configural ? `
                <tr>
                  <td><strong>Configural</strong></td>
                  <td>${invarianceResults.configural.chisq?.toFixed(2)}</td>
                  <td>${invarianceResults.configural.df}</td>
                  <td>${invarianceResults.configural.cfi?.toFixed(3)}</td>
                  <td>${invarianceResults.configural.rmsea?.toFixed(3)}</td>
                  <td>-</td>
                  <td>-</td>
                  <td>
                    ${invarianceResults.configural.conclusion === 'supported'
                      ? '<span class="badge badge-success">✓ Supported</span>'
                      : '<span class="badge badge-danger">✗ Not Supported</span>'}
                  </td>
                </tr>
              ` : ''}
              ${invarianceResults.metric ? `
                <tr>
                  <td><strong>Metric</strong></td>
                  <td>${invarianceResults.metric.chisq?.toFixed(2)}</td>
                  <td>${invarianceResults.metric.df}</td>
                  <td>${invarianceResults.metric.cfi?.toFixed(3)}</td>
                  <td>${invarianceResults.metric.rmsea?.toFixed(3)}</td>
                  <td>${invarianceResults.metric.deltaCFI?.toFixed(3) || 'N/A'}</td>
                  <td>${invarianceResults.metric.deltaRMSEA?.toFixed(3) || 'N/A'}</td>
                  <td>
                    ${invarianceResults.metric.conclusion === 'supported'
                      ? '<span class="badge badge-success">✓ Supported</span>'
                      : '<span class="badge badge-danger">✗ Not Supported</span>'}
                  </td>
                </tr>
              ` : ''}
              ${invarianceResults.scalar ? `
                <tr>
                  <td><strong>Scalar</strong></td>
                  <td>${invarianceResults.scalar.chisq?.toFixed(2)}</td>
                  <td>${invarianceResults.scalar.df}</td>
                  <td>${invarianceResults.scalar.cfi?.toFixed(3)}</td>
                  <td>${invarianceResults.scalar.rmsea?.toFixed(3)}</td>
                  <td>${invarianceResults.scalar.deltaCFI?.toFixed(3) || 'N/A'}</td>
                  <td>${invarianceResults.scalar.deltaRMSEA?.toFixed(3) || 'N/A'}</td>
                  <td>
                    ${invarianceResults.scalar.conclusion === 'supported'
                      ? '<span class="badge badge-success">✓ Supported</span>'
                      : '<span class="badge badge-danger">✗ Not Supported</span>'}
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <div class="interpretation-box">
            <h3>Invariance Level Interpretations</h3>
            <ul>
              <li><strong>Configural Invariance:</strong> Same factor structure (same items load on same factors) across groups</li>
              <li><strong>Metric Invariance:</strong> Same factor loadings; interval-level comparisons valid (correlations comparable)</li>
              <li><strong>Scalar Invariance:</strong> Same item intercepts; mean-level comparisons valid (group means comparable)</li>
              <li><strong>Strict Invariance:</strong> Same residual variances; full measurement equivalence achieved</li>
            </ul>
            <p><strong>Decision Criteria (Cheung & Rensvold, 2002):</strong></p>
            <ul>
              <li>ΔCFI ≤ -0.010 indicates invariance is supported</li>
              <li>ΔRMSEA ≤ 0.015 indicates invariance is supported</li>
              <li>Both criteria should be met to conclude invariance holds</li>
              <li>If criteria not met, test partial invariance by freeing parameters for problematic items</li>
            </ul>
          </div>
        ` : ''}

        <h2>📈 Group Comparisons</h2>
        ${groupComparisons ? `
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>${groupComparisons.focalGroup || 'Focal Group'}</th>
                <th>${groupComparisons.referenceGroup || 'Reference Group'}</th>
                <th>Difference</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Sample Size (N)</strong></td>
                <td>${groupComparisons.focalN || 'N/A'}</td>
                <td>${groupComparisons.referenceN || 'N/A'}</td>
                <td>-</td>
                <td>Sample adequacy check</td>
              </tr>
              <tr>
                <td><strong>Mean Score</strong></td>
                <td>${groupComparisons.focalMean?.toFixed(2) || 'N/A'}</td>
                <td>${groupComparisons.referenceMean?.toFixed(2) || 'N/A'}</td>
                <td><strong>${groupComparisons.meanDifference?.toFixed(2) || 'N/A'}</strong></td>
                <td>Raw mean difference</td>
              </tr>
              <tr>
                <td><strong>Standard Deviation</strong></td>
                <td>${groupComparisons.focalSD?.toFixed(2) || 'N/A'}</td>
                <td>${groupComparisons.referenceSD?.toFixed(2) || 'N/A'}</td>
                <td>-</td>
                <td>Variability comparison</td>
              </tr>
              <tr style="background-color: #fef3c7;">
                <td><strong>Cohen's d</strong></td>
                <td colspan="2" style="text-align: center; font-size: 18px; font-weight: bold; color: #92400e;">
                  ${groupComparisons.cohensD?.toFixed(3) || 'N/A'}
                </td>
                <td>
                  ${groupComparisons.cohensD && Math.abs(groupComparisons.cohensD) < 0.2
                    ? '<span class="badge badge-success">Small effect</span>'
                    : groupComparisons.cohensD && Math.abs(groupComparisons.cohensD) < 0.5
                    ? '<span class="badge badge-warning">Medium effect</span>'
                    : '<span class="badge badge-danger">Large effect</span>'}
                </td>
                <td>Standardized effect size</td>
              </tr>
            </tbody>
          </table>

          <div class="interpretation-box">
            <h3>Effect Size Interpretation (Cohen, 1988)</h3>
            <ul>
              <li><strong>Small effect (|d| ≈ 0.20):</strong> Subtle group difference; may not be practically significant</li>
              <li><strong>Medium effect (|d| ≈ 0.50):</strong> Noticeable group difference; warrants attention</li>
              <li><strong>Large effect (|d| ≈ 0.80):</strong> Substantial group difference; requires careful interpretation</li>
            </ul>
            <p><strong>Important Note:</strong> Group mean differences should only be interpreted if scalar invariance is achieved. Otherwise, differences may reflect measurement bias rather than true trait differences.</p>
          </div>
        ` : ''}

        <h2>✅ Recommendations & Action Items</h2>
        <div class="interpretation-box">
          <h3>Cultural Adaptation Quality Assessment</h3>
          <ul>
            ${difResults?.filter((r: any) => r.classification === 'large').length > 0
              ? '<li><strong>⚠ ACTION REQUIRED:</strong> Items showing large DIF require immediate review. Possible causes include mistranslation, cultural inappropriateness, or measurement non-equivalence.</li>'
              : '<li><strong>✓ DIF ACCEPTABLE:</strong> No items show large DIF. The cultural adaptation demonstrates good cross-cultural validity.</li>'}
            ${invarianceResults?.scalar?.conclusion === 'supported'
              ? '<li><strong>✓ SCALAR INVARIANCE ACHIEVED:</strong> Mean comparisons between cultural groups are valid and interpretable. Scale functions equivalently across groups.</li>'
              : invarianceResults?.metric?.conclusion === 'supported'
              ? '<li><strong>⚠ PARTIAL INVARIANCE:</strong> Correlational analyses valid, but direct mean comparisons should be made with caution. Consider culture-specific norms.</li>'
              : '<li><strong>⚠ LIMITED INVARIANCE:</strong> Scale shows cultural differences in measurement properties. Major revision recommended before cross-cultural use.</li>'}
            ${groupComparisons?.cohensD && Math.abs(groupComparisons.cohensD) > 0.5
              ? '<li><strong>ℹ LARGE GROUP DIFFERENCE:</strong> Substantial mean difference detected. If scalar invariance holds, this reflects true trait difference. Otherwise, indicates measurement bias.</li>'
              : ''}
          </ul>
        </div>

        <div class="interpretation-box">
          <h3>🔬 Next Steps for Cross-Cultural Validation</h3>
          <ol>
            <li><strong>Item Review & Revision:</strong>
              <ul>
                <li>Conduct expert review of all flagged DIF items</li>
                <li>Examine items for cultural appropriateness and relevance</li>
                <li>Review translation quality and conceptual equivalence</li>
                <li>Consider alternative item wording or removal</li>
              </ul>
            </li>
            <li><strong>Qualitative Follow-Up:</strong>
              <ul>
                <li>Conduct cognitive interviews in both cultural groups</li>
                <li>Perform think-aloud protocols to understand item interpretation</li>
                <li>Gather feedback from cultural experts and native speakers</li>
                <li>Document cultural nuances affecting item responses</li>
              </ul>
            </li>
            <li><strong>Statistical Refinement:</strong>
              <ul>
                <li>Test partial invariance models if full invariance not achieved</li>
                <li>Use alignment optimization methods for complex models</li>
                <li>Consider MIMIC models to control for covariates</li>
                <li>Examine item-level and scale-level measurement equivalence</li>
              </ul>
            </li>
            <li><strong>Norm Development:</strong>
              <ul>
                <li>Establish culture-specific norms if scalar invariance not supported</li>
                <li>Develop combined norms if full invariance achieved</li>
                <li>Document appropriate score interpretation by cultural group</li>
                <li>Provide guidance on cross-cultural comparisons</li>
              </ul>
            </li>
            <li><strong>Documentation & Reporting:</strong>
              <ul>
                <li>Document all adaptations and modifications made</li>
                <li>Report invariance testing results in publications</li>
                <li>Provide transparency about cross-cultural validity</li>
                <li>Update test manual with cultural considerations</li>
              </ul>
            </li>
          </ol>
        </div>

        <div class="footer">
          <p><strong>Psychtrix Web</strong> - Professional Cross-Cultural Psychometric Analysis Platform</p>
          <p>© ${new Date().getFullYear()} Psychtrix Innovative. All rights reserved.</p>

          <h3 style="margin-top: 20px; color: #1e40af;">Key References for Cross-Cultural Validation</h3>
          <ul>
            <li>Cheung, G. W., & Rensvold, R. B. (2002). Evaluating goodness-of-fit indexes for testing measurement invariance: A clarification and elaboration of what is being compared. <em>Structural Equation Modeling, 9</em>(2), 233-255.</li>
            <li>Zumbo, B. D. (1999). <em>A handbook on the theory and methods of differential item functioning (DIF): Logistic regression modeling as a unitary framework for binary and Likert-type (ordinal) item scores</em>. Ottawa: Directorate of Human Resources Research and Evaluation, Department of National Defense.</li>
            <li>Vandenberg, R. J., & Lance, C. E. (2000). A review and synthesis of the measurement invariance literature: Suggestions, practices, and recommendations for organizational research. <em>Organizational Research Methods, 3</em>(1), 4-70.</li>
            <li>Beaton, D. E., Bombardier, C., Guillemin, F., & Ferraz, M. B. (2000). Guidelines for the process of cross-cultural adaptation of self-report measures. <em>Spine, 25</em>(24), 3186-3191.</li>
            <li>International Test Commission (2017). <em>ITC Guidelines for Translating and Adapting Tests</em> (2nd ed.). Retrieved from www.InTestCom.org</li>
            <li>Byrne, B. M., & Watkins, D. (2003). The issue of measurement invariance revisited. <em>Journal of Cross-Cultural Psychology, 34</em>(2), 155-175.</li>
            <li>Meredith, W. (1993). Measurement invariance, factor analysis and factorial invariance. <em>Psychometrika, 58</em>(4), 525-543.</li>
          </ul>

          <p style="margin-top: 20px;"><strong>Important Note:</strong> Cross-cultural adaptation and validation require specialized expertise in both psychometrics and cultural psychology. This analysis follows international best practices (ITC Guidelines, 2017) but should be interpreted by qualified cross-cultural measurement specialists. Consult with cultural experts before making high-stakes decisions based on these results.</p>

          <p style="margin-top: 15px; font-style: italic;">For questions or consultation: support@psychtrixinnovative.com</p>
        </div>
      </div>

      <script>
        window.print = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_Cultural_Adaptation_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportCFAToWord = (results: any, studyName: string = 'CFA Analysis') => {
  if (!results) return;

  const timestamp = new Date().toLocaleString();

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${studyName}</title>
      <style>
        body { font-family: 'Calibri', sans-serif; font-size: 11pt; line-height: 1.5; margin: 40px; }
        h1 { font-size: 16pt; font-weight: bold; margin-bottom: 12pt; color: #1e40af; }
        h2 { font-size: 14pt; font-weight: bold; margin-top: 18pt; margin-bottom: 10pt; color: #2563eb; }
        h3 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 8pt; }
        table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
        th, td { border: 1px solid #000; padding: 6pt; text-align: left; }
        th { background-color: #dbeafe; font-weight: bold; }
        .fit-good { background-color: #dcfce7; }
        .fit-adequate { background-color: #fef3c7; }
        .fit-poor { background-color: #fee2e2; }
        .info { color: #6b7280; font-size: 9pt; margin: 6pt 0; }
      </style>
    </head>
    <body>
      <h1>${studyName}</h1>
      <p class="info">Generated: ${timestamp}</p>

      <h2>Model Fit Indices</h2>
      <table>
        <tr>
          <th>Index</th>
          <th>Value</th>
          <th>Cutoff</th>
          <th>Interpretation</th>
        </tr>
        <tr class="${parseFloat(results.fitIndices.cfi) >= 0.95 ? 'fit-good' : parseFloat(results.fitIndices.cfi) >= 0.90 ? 'fit-adequate' : 'fit-poor'}">
          <td>CFI</td>
          <td>${Number(results.fitIndices.cfi).toFixed(3)}</td>
          <td>≥ 0.95 (good), ≥ 0.90 (adequate)</td>
          <td>${parseFloat(results.fitIndices.cfi) >= 0.95 ? 'Good fit' : parseFloat(results.fitIndices.cfi) >= 0.90 ? 'Adequate fit' : 'Poor fit'}</td>
        </tr>
        <tr class="${parseFloat(results.fitIndices.tli) >= 0.95 ? 'fit-good' : parseFloat(results.fitIndices.tli) >= 0.90 ? 'fit-adequate' : 'fit-poor'}">
          <td>TLI</td>
          <td>${Number(results.fitIndices.tli).toFixed(3)}</td>
          <td>≥ 0.95 (good), ≥ 0.90 (adequate)</td>
          <td>${parseFloat(results.fitIndices.tli) >= 0.95 ? 'Good fit' : parseFloat(results.fitIndices.tli) >= 0.90 ? 'Adequate fit' : 'Poor fit'}</td>
        </tr>
        <tr class="${parseFloat(results.fitIndices.rmsea) <= 0.06 ? 'fit-good' : parseFloat(results.fitIndices.rmsea) <= 0.08 ? 'fit-adequate' : 'fit-poor'}">
          <td>RMSEA</td>
          <td>${Number(results.fitIndices.rmsea).toFixed(3)}</td>
          <td>≤ 0.06 (good), ≤ 0.08 (adequate)</td>
          <td>${parseFloat(results.fitIndices.rmsea) <= 0.06 ? 'Good fit' : parseFloat(results.fitIndices.rmsea) <= 0.08 ? 'Adequate fit' : 'Poor fit'}</td>
        </tr>
        <tr class="${parseFloat(results.fitIndices.srmr) <= 0.08 ? 'fit-good' : 'fit-poor'}">
          <td>SRMR</td>
          <td>${Number(results.fitIndices.srmr).toFixed(3)}</td>
          <td>≤ 0.08 (good)</td>
          <td>${parseFloat(results.fitIndices.srmr) <= 0.08 ? 'Good fit' : 'Poor fit'}</td>
        </tr>
        <tr>
          <td>χ²</td>
          <td>${Number(results.fitIndices.chisq).toFixed(2)}</td>
          <td>Lower is better</td>
          <td>df = ${results.fitIndices.df}, p = ${Number(results.fitIndices.pvalue).toFixed(3)}</td>
        </tr>
        <tr>
          <td>AIC</td>
          <td>${Number(results.fitIndices.aic).toFixed(2)}</td>
          <td>Compare models</td>
          <td>Lower indicates better fit</td>
        </tr>
        <tr>
          <td>BIC</td>
          <td>${Number(results.fitIndices.bic).toFixed(2)}</td>
          <td>Compare models</td>
          <td>Lower indicates better fit</td>
        </tr>
      </table>

      <h2>Factor Loadings</h2>
      <table>
        <tr>
          <th>Item</th>
          <th>Factor</th>
          <th>Loading</th>
          <th>SE</th>
          <th>Z-value</th>
          <th>p-value</th>
        </tr>
        ${results.factorLoadings.map((loading: any) => `
          <tr>
            <td>${loading.item}</td>
            <td>${loading.factor}</td>
            <td>${Number(loading.loading).toFixed(3)}</td>
            <td>${Number(loading.se).toFixed(3)}</td>
            <td>${Number(loading.z ?? loading.zvalue).toFixed(3)}</td>
            <td>${Number(loading.pvalue).toFixed(3)}</td>
          </tr>
        `).join('')}
      </table>

      ${results.factorCorrelations && results.factorCorrelations.length > 0 ? `
        <h2>Factor Correlations</h2>
        <table>
          <tr>
            <th>Factor 1</th>
            <th>Factor 2</th>
            <th>Correlation</th>
          </tr>
          ${results.factorCorrelations.map((corr: any) => `
            <tr>
              <td>${corr.factor1}</td>
              <td>${corr.factor2}</td>
              <td>${corr.correlation}</td>
            </tr>
          `).join('')}
        </table>
      ` : ''}

      <p class="info">Note: Path diagram should be exported separately as PNG</p>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportCFAToHTML = (results: any, studyName: string = 'CFA Analysis') => {
  if (!results) return;

  const timestamp = new Date().toLocaleString();

  let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${studyName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background-color: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        h1 {
          color: #1e40af;
          font-size: 32px;
          border-bottom: 4px solid #1e40af;
          padding-bottom: 15px;
          margin-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          font-size: 24px;
          margin-top: 40px;
          margin-bottom: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background-color: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        th {
          background-color: #dbeafe;
          font-weight: 600;
          color: #1e40af;
        }
        tr:hover {
          background-color: #f9fafb;
        }
        .fit-good { background-color: #dcfce7; }
        .fit-adequate { background-color: #fef3c7; }
        .fit-poor { background-color: #fee2e2; }
        .info {
          color: #6b7280;
          font-size: 14px;
          margin: 10px 0;
        }
        .print-btn {
          background-color: #2563eb;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          margin: 20px 0;
        }
        .print-btn:hover {
          background-color: #1e40af;
        }
        @media print {
          body { background: white; padding: 0; }
          .container { box-shadow: none; padding: 20px; }
          .print-btn { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${studyName}</h1>
        <p class="info">Generated: ${timestamp}</p>
        <button class="print-btn" onclick="window.print()">Print Report</button>

        <h2>Model Fit Indices</h2>
        <table>
          <tr>
            <th>Index</th>
            <th>Value</th>
            <th>Cutoff</th>
            <th>Interpretation</th>
          </tr>
          <tr class="${parseFloat(results.fitIndices.cfi) >= 0.95 ? 'fit-good' : parseFloat(results.fitIndices.cfi) >= 0.90 ? 'fit-adequate' : 'fit-poor'}">
            <td>CFI</td>
            <td>${results.fitIndices.cfi}</td>
            <td>≥ 0.95 (good), ≥ 0.90 (adequate)</td>
            <td>${parseFloat(results.fitIndices.cfi) >= 0.95 ? 'Good fit' : parseFloat(results.fitIndices.cfi) >= 0.90 ? 'Adequate fit' : 'Poor fit'}</td>
          </tr>
          <tr class="${parseFloat(results.fitIndices.tli) >= 0.95 ? 'fit-good' : parseFloat(results.fitIndices.tli) >= 0.90 ? 'fit-adequate' : 'fit-poor'}">
            <td>TLI</td>
            <td>${results.fitIndices.tli}</td>
            <td>≥ 0.95 (good), ≥ 0.90 (adequate)</td>
            <td>${parseFloat(results.fitIndices.tli) >= 0.95 ? 'Good fit' : parseFloat(results.fitIndices.tli) >= 0.90 ? 'Adequate fit' : 'Poor fit'}</td>
          </tr>
          <tr class="${parseFloat(results.fitIndices.rmsea) <= 0.06 ? 'fit-good' : parseFloat(results.fitIndices.rmsea) <= 0.08 ? 'fit-adequate' : 'fit-poor'}">
            <td>RMSEA</td>
            <td>${results.fitIndices.rmsea}</td>
            <td>≤ 0.06 (good), ≤ 0.08 (adequate)</td>
            <td>${parseFloat(results.fitIndices.rmsea) <= 0.06 ? 'Good fit' : parseFloat(results.fitIndices.rmsea) <= 0.08 ? 'Adequate fit' : 'Poor fit'}</td>
          </tr>
          <tr class="${parseFloat(results.fitIndices.srmr) <= 0.08 ? 'fit-good' : 'fit-poor'}">
            <td>SRMR</td>
            <td>${results.fitIndices.srmr}</td>
            <td>≤ 0.08 (good)</td>
            <td>${parseFloat(results.fitIndices.srmr) <= 0.08 ? 'Good fit' : 'Poor fit'}</td>
          </tr>
          <tr>
            <td>χ²</td>
            <td>${results.fitIndices.chisq}</td>
            <td>Lower is better</td>
            <td>df = ${results.fitIndices.df}, p = ${results.fitIndices.pvalue}</td>
          </tr>
          <tr>
            <td>AIC</td>
            <td>${results.fitIndices.aic}</td>
            <td>Compare models</td>
            <td>Lower indicates better fit</td>
          </tr>
          <tr>
            <td>BIC</td>
            <td>${results.fitIndices.bic}</td>
            <td>Compare models</td>
            <td>Lower indicates better fit</td>
          </tr>
        </table>

        <h2>Factor Loadings</h2>
        <table>
          <tr>
            <th>Item</th>
            <th>Factor</th>
            <th>Loading</th>
            <th>SE</th>
            <th>Z-value</th>
            <th>p-value</th>
          </tr>
          ${results.factorLoadings.map((loading: any) => `
            <tr>
              <td>${loading.item}</td>
              <td>${loading.factor}</td>
              <td>${Number(loading.loading).toFixed(3)}</td>
              <td>${Number(loading.se).toFixed(3)}</td>
              <td>${Number(loading.z ?? loading.zvalue).toFixed(3)}</td>
              <td>${Number(loading.pvalue).toFixed(3)}</td>
            </tr>
          `).join('')}
        </table>

        ${results.factorCorrelations && results.factorCorrelations.length > 0 ? `
          <h2>Factor Correlations</h2>
          <table>
            <tr>
              <th>Factor 1</th>
              <th>Factor 2</th>
              <th>Correlation</th>
            </tr>
            ${results.factorCorrelations.map((corr: any) => `
              <tr>
                <td>${corr.factor1}</td>
                <td>${corr.factor2}</td>
                <td>${corr.correlation}</td>
              </tr>
            `).join('')}
          </table>
        ` : ''}

        <p class="info">Note: Path diagram should be exported separately as PNG</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportSEMToWord = (results: any, studyName: string = 'SEM Analysis') => {
  if (!results) return;

  const timestamp = new Date().toLocaleString();

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${studyName}</title>
      <style>
        body { font-family: 'Calibri', sans-serif; font-size: 11pt; line-height: 1.5; margin: 40px; }
        h1 { font-size: 16pt; font-weight: bold; margin-bottom: 12pt; color: #1e40af; }
        h2 { font-size: 14pt; font-weight: bold; margin-top: 18pt; margin-bottom: 10pt; color: #2563eb; }
        table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
        th, td { border: 1px solid #000; padding: 6pt; text-align: left; }
        th { background-color: #dbeafe; font-weight: bold; }
        .info { color: #6b7280; font-size: 9pt; margin: 6pt 0; }
      </style>
    </head>
    <body>
      <h1>${studyName}</h1>
      <p class="info">Generated: ${timestamp}</p>

      <h2>Model Fit Indices</h2>
      <table>
        <tr>
          <th>Index</th>
          <th>Value</th>
        </tr>
        ${(() => {
          const fi = results.fitIndices || {};
          const show: Array<[string, string]> = [
            ['χ²', fi.chisq != null ? Number(fi.chisq).toFixed(2) : '—'],
            ['df', fi.df != null ? String(fi.df) : '—'],
            ['p-value', fi.pvalue != null ? Number(fi.pvalue).toFixed(3) : '—'],
            ['CFI', fi.cfi != null ? Number(fi.cfi).toFixed(3) : '—'],
            ['TLI', fi.tli != null ? Number(fi.tli).toFixed(3) : '—'],
            ['RMSEA', fi.rmsea != null ? Number(fi.rmsea).toFixed(3) : '—'],
            ['SRMR', fi.srmr != null ? Number(fi.srmr).toFixed(3) : '—'],
            ['AIC', fi.aic != null ? Number(fi.aic).toFixed(2) : '—'],
            ['BIC', fi.bic != null ? Number(fi.bic).toFixed(2) : '—'],
          ];
          if (fi.scaled) show.push(['Estimator', 'DWLS (robust, mean-adjusted)']);
          return show.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
        })()}
      </table>

      <h2>Structural Path Coefficients</h2>
      <table>
        <tr>
          <th>From</th>
          <th>To</th>
          <th>β (std)</th>
          <th>SE</th>
          <th>z</th>
          <th>p-value</th>
        </tr>
        ${((results.structuralModel?.paths) || results.pathCoefficients || []).map((path: any) => `
          <tr>
            <td>${path.from}</td>
            <td>${path.to}</td>
            <td>${Number(path.std_coefficient ?? path.coefficient).toFixed(3)}</td>
            <td>${Number(path.se).toFixed(3)}</td>
            <td>${path.z != null ? Number(path.z).toFixed(3) : 'N/A'}</td>
            <td>${path.pvalue != null ? Number(path.pvalue).toFixed(3) : 'N/A'}</td>
          </tr>
        `).join('')}
      </table>

      ${(() => {
        const fl = results.measurementModel?.factorLoadings || [];
        return fl.length ? `<h2>Factor Loadings</h2><table>
          <tr><th>Item</th><th>Factor</th><th>λ (std)</th><th>SE</th><th>z</th><th>p-value</th></tr>
          ${fl.map((l: any) => `<tr><td>${l.item}</td><td>${l.factor}</td><td>${Number(l.std_loading ?? l.loading).toFixed(3)}</td><td>${Number(l.se).toFixed(3)}</td><td>${Number(l.z).toFixed(3)}</td><td>${Number(l.pvalue).toFixed(3)}</td></tr>`).join('')}
        </table>` : '';
      })()}

      <p class="info">Note: SEM path diagram should be exported separately as PNG</p>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportSEMToHTML = (results: any, studyName: string = 'SEM Analysis') => {
  if (!results) return;

  const timestamp = new Date().toLocaleString();

  let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${studyName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background-color: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        h1 {
          color: #1e40af;
          font-size: 32px;
          border-bottom: 4px solid #1e40af;
          padding-bottom: 15px;
          margin-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          font-size: 24px;
          margin-top: 40px;
          margin-bottom: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background-color: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        th {
          background-color: #dbeafe;
          font-weight: 600;
          color: #1e40af;
        }
        tr:hover {
          background-color: #f9fafb;
        }
        .print-btn {
          background-color: #2563eb;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          margin: 20px 0;
        }
        .print-btn:hover {
          background-color: #1e40af;
        }
        @media print {
          body { background: white; padding: 0; }
          .container { box-shadow: none; padding: 20px; }
          .print-btn { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${studyName}</h1>
        <p style="color: #6b7280; font-size: 14px;">Generated: ${timestamp}</p>
        <button class="print-btn" onclick="window.print()">Print Report</button>

        <h2>Model Fit Indices</h2>
        <table>
          <tr>
            <th>Index</th>
            <th>Value</th>
          </tr>
          ${(() => {
            const fi = results.fitIndices || {};
            const show: Array<[string, string]> = [
              ['χ²', fi.chisq != null ? Number(fi.chisq).toFixed(2) : '—'],
              ['df', fi.df != null ? String(fi.df) : '—'],
              ['p-value', fi.pvalue != null ? Number(fi.pvalue).toFixed(3) : '—'],
              ['CFI', fi.cfi != null ? Number(fi.cfi).toFixed(3) : '—'],
              ['TLI', fi.tli != null ? Number(fi.tli).toFixed(3) : '—'],
              ['RMSEA', fi.rmsea != null ? Number(fi.rmsea).toFixed(3) : '—'],
              ['SRMR', fi.srmr != null ? Number(fi.srmr).toFixed(3) : '—'],
              ['AIC', fi.aic != null ? Number(fi.aic).toFixed(2) : '—'],
              ['BIC', fi.bic != null ? Number(fi.bic).toFixed(2) : '—'],
            ];
            if (fi.scaled) show.push(['Estimator', 'DWLS (robust, mean-adjusted)']);
            return show.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
          })()}
        </table>

        <h2>Structural Path Coefficients</h2>
        <table>
          <tr>
            <th>From</th>
            <th>To</th>
            <th>β (std)</th>
            <th>SE</th>
            <th>z</th>
            <th>p-value</th>
          </tr>
          ${((results.structuralModel?.paths) || results.pathCoefficients || []).map((path: any) => `
            <tr>
              <td>${path.from}</td>
              <td>${path.to}</td>
              <td>${Number(path.std_coefficient ?? path.coefficient).toFixed(3)}</td>
              <td>${Number(path.se).toFixed(3)}</td>
              <td>${path.z != null ? Number(path.z).toFixed(3) : 'N/A'}</td>
              <td>${path.pvalue != null ? Number(path.pvalue).toFixed(3) : 'N/A'}</td>
            </tr>
          `).join('')}
        </table>

        ${(() => {
          const fl = results.measurementModel?.factorLoadings || [];
          return fl.length ? `<h2>Factor Loadings</h2><table>
            <tr><th>Item</th><th>Factor</th><th>λ (std)</th><th>SE</th><th>z</th><th>p-value</th></tr>
            ${fl.map((l: any) => `<tr><td>${l.item}</td><td>${l.factor}</td><td>${Number(l.std_loading ?? l.loading).toFixed(3)}</td><td>${Number(l.se).toFixed(3)}</td><td>${Number(l.z).toFixed(3)}</td><td>${Number(l.pvalue).toFixed(3)}</td></tr>`).join('')}
          </table>` : '';
        })()}

        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Note: SEM path diagram should be exported separately as PNG</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportInvarianceToWord = (results: any, studyName: string = 'Measurement Invariance') => {
  if (!results) return;

  const timestamp = new Date().toLocaleString();

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${studyName}</title>
      <style>
        body { font-family: 'Calibri', sans-serif; font-size: 11pt; line-height: 1.5; margin: 40px; }
        h1 { font-size: 16pt; font-weight: bold; margin-bottom: 12pt; color: #1e40af; }
        h2 { font-size: 14pt; font-weight: bold; margin-top: 18pt; margin-bottom: 10pt; color: #2563eb; }
        table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
        th, td { border: 1px solid #000; padding: 6pt; text-align: left; }
        th { background-color: #dbeafe; font-weight: bold; }
        .supported { background-color: #dcfce7; }
        .not-supported { background-color: #fee2e2; }
        .info { color: #6b7280; font-size: 9pt; margin: 6pt 0; }
      </style>
    </head>
    <body>
      <h1>${studyName}</h1>
      <p class="info">Generated: ${timestamp}</p>

      <h2>Invariance Test Results</h2>
      <table>
        <tr>
          <th>Model</th>
          <th>χ²</th>
          <th>df</th>
          <th>CFI</th>
          <th>RMSEA</th>
          <th>ΔCFI</th>
          <th>ΔRMSEA</th>
          <th>Conclusion</th>
        </tr>
        ${['configural', 'metric', 'scalar', 'strict'].map(level => {
          const model = results[level];
          if (!model) return '';
          return `
            <tr class="${model.conclusion === 'supported' ? 'supported' : 'not-supported'}">
              <td>${level.charAt(0).toUpperCase() + level.slice(1)}</td>
              <td>${model.chisq || 'N/A'}</td>
              <td>${model.df || 'N/A'}</td>
              <td>${model.cfi || 'N/A'}</td>
              <td>${model.rmsea || 'N/A'}</td>
              <td>${model.deltaCFI || 'N/A'}</td>
              <td>${model.deltaRMSEA || 'N/A'}</td>
              <td>${model.conclusion || 'N/A'}</td>
            </tr>
          `;
        }).join('')}
      </table>

      <h2>Invariance Decision Criteria</h2>
      <ul>
        <li>ΔCFI ≤ 0.010 indicates invariance is supported</li>
        <li>ΔRMSEA ≤ 0.015 indicates invariance is supported</li>
        <li>CFI ≥ 0.95 indicates good model fit</li>
        <li>RMSEA ≤ 0.06 indicates good model fit</li>
      </ul>

      <p class="info">Note: Invariance path diagrams should be exported separately as PNG</p>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportInvarianceToHTML = (results: any, studyName: string = 'Measurement Invariance') => {
  if (!results) return;

  const timestamp = new Date().toLocaleString();

  let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${studyName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background-color: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        h1 {
          color: #1e40af;
          font-size: 32px;
          border-bottom: 4px solid #1e40af;
          padding-bottom: 15px;
          margin-bottom: 10px;
        }
        h2 {
          color: #2563eb;
          font-size: 24px;
          margin-top: 40px;
          margin-bottom: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background-color: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        th {
          background-color: #dbeafe;
          font-weight: 600;
          color: #1e40af;
        }
        tr:hover {
          background-color: #f9fafb;
        }
        .supported { background-color: #dcfce7; }
        .not-supported { background-color: #fee2e2; }
        .print-btn {
          background-color: #2563eb;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          margin: 20px 0;
        }
        .print-btn:hover {
          background-color: #1e40af;
        }
        ul {
          margin: 20px 0;
          padding-left: 30px;
        }
        li {
          margin: 8px 0;
        }
        @media print {
          body { background: white; padding: 0; }
          .container { box-shadow: none; padding: 20px; }
          .print-btn { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${studyName}</h1>
        <p style="color: #6b7280; font-size: 14px;">Generated: ${timestamp}</p>
        <button class="print-btn" onclick="window.print()">Print Report</button>

        <h2>Invariance Test Results</h2>
        <table>
          <tr>
            <th>Model</th>
            <th>χ²</th>
            <th>df</th>
            <th>CFI</th>
            <th>RMSEA</th>
            <th>ΔCFI</th>
            <th>ΔRMSEA</th>
            <th>Conclusion</th>
          </tr>
          ${['configural', 'metric', 'scalar', 'strict'].map(level => {
            const model = results[level];
            if (!model) return '';
            return `
              <tr class="${model.conclusion === 'supported' ? 'supported' : 'not-supported'}">
                <td><strong>${level.charAt(0).toUpperCase() + level.slice(1)}</strong></td>
                <td>${model.chisq || 'N/A'}</td>
                <td>${model.df || 'N/A'}</td>
                <td>${model.cfi || 'N/A'}</td>
                <td>${model.rmsea || 'N/A'}</td>
                <td>${model.deltaCFI || 'N/A'}</td>
                <td>${model.deltaRMSEA || 'N/A'}</td>
                <td><strong>${model.conclusion || 'N/A'}</strong></td>
              </tr>
            `;
          }).join('')}
        </table>

        <h2>Invariance Decision Criteria</h2>
        <ul>
          <li>ΔCFI ≤ 0.010 indicates invariance is supported</li>
          <li>ΔRMSEA ≤ 0.015 indicates invariance is supported</li>
          <li>CFI ≥ 0.95 indicates good model fit</li>
          <li>RMSEA ≤ 0.06 indicates good model fit</li>
        </ul>

        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Note: Invariance path diagrams should be exported separately as PNG</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${studyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};


export const exportPathAnalysisResults = (results: any) => {
  if (!results || !results.paths) {
    console.error('No results to export');
    return;
  }

  const timestamp = new Date().toLocaleString();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Path Analysis Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
        h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
        h2 { color: #2563eb; margin-top: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        h3 { color: #3b82f6; margin-top: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #3b82f6; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f3f4f6; }
        .metric-container { display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; }
        .metric-box { flex: 0 0 calc(33.333% - 10px); padding: 15px 20px; border-radius: 8px; background-color: #eff6ff; border-left: 4px solid #3b82f6; }
        .metric-label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #1e40af; }
        .interpretation { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
        .guideline { background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10b981; }
        .significant { color: #10b981; font-weight: bold; }
        .not-significant { color: #6b7280; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        .mediation-box { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #f59e0b; }
        @media print { body { margin: 20px; } .metric-box { page-break-inside: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } }
      </style>
    </head>
    <body>
      <h1>Path Analysis Report</h1>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web</p>
      <p><strong>Analysis Type:</strong> Path Analysis with Direct and Indirect Effects</p>

      <div class="interpretation">
        <h3>Path Analysis Overview</h3>
        <p>Path analysis examines causal relationships among observed variables, testing complex models involving direct and indirect effects, mediation, and moderation.</p>
      </div>

      <h2>Model Fit Indices</h2>
      <div class="metric-container">
        <div class="metric-box"><div class="metric-label">Chi-Square (χ²)</div><div class="metric-value">${results.fitIndices?.chisq?.toFixed(2) || 'N/A'}</div><div class="metric-label">df = ${results.fitIndices?.df || 'N/A'}, p = ${results.fitIndices?.pvalue?.toFixed(3) || 'N/A'}</div></div>
        <div class="metric-box"><div class="metric-label">CFI</div><div class="metric-value">${results.fitIndices?.cfi?.toFixed(3) || 'N/A'}</div><div class="metric-label">${results.fitIndices?.cfi >= 0.95 ? 'Excellent' : results.fitIndices?.cfi >= 0.90 ? 'Good' : 'Poor'}</div></div>
        <div class="metric-box"><div class="metric-label">TLI</div><div class="metric-value">${results.fitIndices?.tli?.toFixed(3) || 'N/A'}</div><div class="metric-label">${results.fitIndices?.tli >= 0.95 ? 'Excellent' : results.fitIndices?.tli >= 0.90 ? 'Good' : 'Poor'}</div></div>
        <div class="metric-box"><div class="metric-label">RMSEA</div><div class="metric-value">${results.fitIndices?.rmsea?.toFixed(3) || 'N/A'}</div><div class="metric-label">90% CI [${results.fitIndices?.rmsea_ci_lower?.toFixed(3) || 'N/A'}, ${results.fitIndices?.rmsea_ci_upper?.toFixed(3) || 'N/A'}]</div></div>
        <div class="metric-box"><div class="metric-label">SRMR</div><div class="metric-value">${results.fitIndices?.srmr?.toFixed(3) || 'N/A'}</div><div class="metric-label">${results.fitIndices?.srmr <= 0.08 ? 'Good' : 'Poor'}</div></div>
        <div class="metric-box"><div class="metric-label">GFI</div><div class="metric-value">${results.fitIndices?.gfi?.toFixed(3) || 'N/A'}</div></div>
      </div>

      <div class="guideline"><h3>Fit Index Guidelines</h3><ul><li><strong>CFI/TLI:</strong> ≥ 0.95 excellent, ≥ 0.90 acceptable</li><li><strong>RMSEA:</strong> ≤ 0.05 excellent, ≤ 0.08 acceptable</li><li><strong>SRMR:</strong> ≤ 0.08 good</li></ul></div>

      <h2>Path Coefficients</h2>
      <table><thead><tr><th>From</th><th>To</th><th>B (Unstd.)</th><th>β (Std.)</th><th>SE</th><th>t</th><th>p</th><th>Sig.</th></tr></thead><tbody>${results.paths.map((p: any) => `<tr><td><strong>${p.from}</strong></td><td><strong>${p.to}</strong></td><td>${p.coefficient?.toFixed(3) || 'N/A'}</td><td>${p.beta?.toFixed(3) || 'N/A'}</td><td>${p.se?.toFixed(3) || 'N/A'}</td><td>${p.t?.toFixed(3) || 'N/A'}</td><td>${p.pvalue?.toFixed(3) || 'N/A'}</td><td class="${p.pvalue < 0.05 ? 'significant' : 'not-significant'}">${p.pvalue < 0.001 ? '***' : p.pvalue < 0.01 ? '**' : p.pvalue < 0.05 ? '*' : 'ns'}</td></tr>`).join('')}</tbody></table>

      ${results.rSquared && Object.keys(results.rSquared).length > 0 ? `<h2>R² Values</h2><table><thead><tr><th>Variable</th><th>R²</th><th>% Variance</th><th>Interpretation</th></tr></thead><tbody>${Object.entries(results.rSquared).map(([v, r2]: [string, any]) => `<tr><td><strong>${v}</strong></td><td>${r2?.toFixed(3)}</td><td>${(r2 * 100)?.toFixed(1)}%</td><td>${r2 >= 0.26 ? 'Substantial' : r2 >= 0.13 ? 'Moderate' : r2 >= 0.02 ? 'Small' : 'Negligible'}</td></tr>`).join('')}</tbody></table>` : ''}

      ${results.effects?.total ? `<h2>Total Effects</h2><table><thead><tr><th>From</th><th>To</th><th>Effect</th><th>SE</th><th>p</th><th>Sig.</th></tr></thead><tbody>${results.effects.total.map((e: any) => `<tr><td><strong>${e.from}</strong></td><td><strong>${e.to}</strong></td><td>${e.effect?.toFixed(3)}</td><td>${e.se?.toFixed(3)}</td><td>${e.pvalue?.toFixed(3)}</td><td class="${e.pvalue < 0.05 ? 'significant' : 'not-significant'}">${e.pvalue < 0.001 ? '***' : e.pvalue < 0.01 ? '**' : e.pvalue < 0.05 ? '*' : 'ns'}</td></tr>`).join('')}</tbody></table>` : ''}

      ${results.effects?.indirect?.length > 0 ? `<h2>Indirect Effects</h2><table><thead><tr><th>From</th><th>To</th><th>Via</th><th>Effect</th><th>SE</th><th>95% CI</th><th>p</th></tr></thead><tbody>${results.effects.indirect.map((e: any) => `<tr><td><strong>${e.from}</strong></td><td><strong>${e.to}</strong></td><td>${e.via?.join(' → ')}</td><td>${e.effect?.toFixed(3)}</td><td>${e.se?.toFixed(3)}</td><td>[${e.bootstrapCI?.[0]?.toFixed(3)}, ${e.bootstrapCI?.[1]?.toFixed(3)}]</td><td class="${e.pvalue < 0.05 ? 'significant' : 'not-significant'}">${e.pvalue?.toFixed(3)}</td></tr>`).join('')}</tbody></table>` : ''}

      ${results.mediation?.length > 0 ? `<h2>Mediation Analysis</h2>${results.mediation.map((m: any) => `<div class="mediation-box"><h3>${m.iv} → ${m.mediator} → ${m.dv}</h3><table><tr><td>Direct Effect (c')</td><td>${m.directEffect?.toFixed(3)}</td></tr><tr><td>Indirect Effect (ab)</td><td>${m.indirectEffect?.toFixed(3)}</td></tr><tr><td>Total Effect (c)</td><td>${m.totalEffect?.toFixed(3)}</td></tr><tr><td>Proportion Mediated</td><td>${(m.proportion * 100)?.toFixed(1)}%</td></tr><tr><td>Sobel z</td><td>${m.sobelZ?.toFixed(3)} (p = ${m.sobelP?.toFixed(3)})</td></tr><tr><td>Bootstrap 95% CI</td><td>[${m.bootstrapCI?.[0]?.toFixed(3)}, ${m.bootstrapCI?.[1]?.toFixed(3)}]</td></tr><tr><td><strong>Type</strong></td><td><strong>${m.mediationType === 'full' ? 'Full Mediation' : m.mediationType === 'partial' ? 'Partial Mediation' : 'No Mediation'}</strong></td></tr></table></div>`).join('')}` : ''}

      <div class="footer"><p><strong>Psychtrix Web</strong></p><p><strong>References:</strong></p><ul style="font-size: 11px;"><li>Baron & Kenny (1986). The moderator-mediator variable distinction. Journal of Personality and Social Psychology, 51(6), 1173-1182.</li><li>Hayes (2018). Introduction to mediation, moderation, and conditional process analysis (2nd ed.). Guilford Press.</li><li>Kline (2015). Principles and practice of structural equation modeling (4th ed.). Guilford Press.</li></ul></div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Path_Analysis_Report_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};


export const exportScaleSandboxResults = (project: any, results: any) => {
  if (!project || !results) {
    console.error('No results to export');
    return;
  }

  const timestamp = new Date().toLocaleString();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Scale Development Report - ${project.name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
        h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
        h2 { color: #2563eb; margin-top: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        h3 { color: #3b82f6; margin-top: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #3b82f6; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f3f4f6; }
        .metric-container { display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; }
        .metric-box { flex: 0 0 calc(33.333% - 10px); padding: 15px 20px; border-radius: 8px; background-color: #eff6ff; border-left: 4px solid #3b82f6; }
        .metric-label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #1e40af; }
        .interpretation { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
        .guideline { background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10b981; }
        .item-box { background-color: #f9fafb; padding: 10px 15px; margin: 5px 0; border-radius: 6px; border-left: 3px solid #3b82f6; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        @media print { body { margin: 20px; } .metric-box { page-break-inside: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } }
      </style>
    </head>
    <body>
      <h1>Scale Development Report</h1>
      <p><strong>Scale Name:</strong> ${project.name}</p>
      <p><strong>Description:</strong> ${project.description || 'N/A'}</p>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Scale Development Sandbox</p>
      <p><strong>Status:</strong> ${project.status}</p>

      <div class="interpretation">
        <h3>Scale Overview</h3>
        <p>This report summarizes the psychometric properties of your scale, including reliability coefficients, item statistics, and normative data.</p>
      </div>

      <h2>Scale Configuration</h2>
      <table>
        <tr><th>Property</th><th>Value</th></tr>
        <tr><td>Number of Items</td><td>${project.items?.length || 0}</td></tr>
        <tr><td>Response Format</td><td>${project.response_scale?.type || 'N/A'}</td></tr>
        <tr><td>Response Range</td><td>${project.response_scale?.min || 'N/A'} to ${project.response_scale?.max || 'N/A'}</td></tr>
        <tr><td>Number of Subscales</td><td>${project.subscales?.length || 0}</td></tr>
        <tr><td>Total Responses</td><td>${results.descriptives?.n || project.responseCount || 0}</td></tr>
      </table>

      ${project.subscales && project.subscales.length > 0 ? `
      <h2>Subscales</h2>
      <ul>
        ${project.subscales.map((sub: string) => `<li><strong>${sub}</strong></li>`).join('')}
      </ul>
      ` : ''}

      <h2>Comprehensive Reliability Analysis</h2>
      <div class="metric-container">
        <div class="metric-box">
          <div class="metric-label">Cronbach's Alpha (α)</div>
          <div class="metric-value">${results.reliability?.cronbach_alpha?.toFixed(3) || 'N/A'}</div>
          ${results.reliability?.alpha_ci ? `
          <div class="metric-label" style="font-size: 11px; margin-top: 5px;">
            95% CI: [${results.reliability.alpha_ci.lower.toFixed(3)}, ${results.reliability.alpha_ci.upper.toFixed(3)}]
          </div>` : ''}
          <div class="metric-label">${results.reliability?.cronbach_alpha >= 0.90 ? 'Excellent' : results.reliability?.cronbach_alpha >= 0.80 ? 'Good' : results.reliability?.cronbach_alpha >= 0.70 ? 'Acceptable' : 'Questionable'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">McDonald's Omega (ω)</div>
          <div class="metric-value">${results.reliability?.omega_total?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">Composite Reliability</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Split-Half Reliability</div>
          <div class="metric-value">${results.reliability?.split_half?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">Spearman-Brown</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Guttman's Lambda-6 (λ₆)</div>
          <div class="metric-value">${results.reliability?.guttman_lambda6?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">Alternative Reliability</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Standard Error of Measurement</div>
          <div class="metric-value">${results.reliability?.sem?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">Measurement Precision</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Average Inter-Item r</div>
          <div class="metric-value">${results.reliability?.average_r?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">Mean Correlation</div>
        </div>
      </div>

      <div class="guideline">
        <h3>Reliability Interpretation</h3>
        <ul>
          <li><strong>α ≥ 0.90:</strong> Excellent reliability</li>
          <li><strong>0.80 ≤ α < 0.90:</strong> Good reliability</li>
          <li><strong>0.70 ≤ α < 0.80:</strong> Acceptable reliability</li>
          <li><strong>0.60 ≤ α < 0.70:</strong> Questionable reliability</li>
          <li><strong>α < 0.60:</strong> Poor reliability (revise scale)</li>
        </ul>
      </div>

      ${results.descriptives ? `
      <h2>Scale Descriptive Statistics</h2>
      <table>
        <tr><th>Statistic</th><th>Value</th></tr>
        <tr><td>Sample Size (N)</td><td>${results.descriptives.n || 0}</td></tr>
        <tr><td>Mean Score</td><td>${results.descriptives.mean?.toFixed(2) || 'N/A'}</td></tr>
        <tr><td>Standard Deviation</td><td>${results.descriptives.sd?.toFixed(2) || 'N/A'}</td></tr>
        <tr><td>Minimum Score</td><td>${results.descriptives.min?.toFixed(2) || 'N/A'}</td></tr>
        <tr><td>Maximum Score</td><td>${results.descriptives.max?.toFixed(2) || 'N/A'}</td></tr>
      </table>
      ` : ''}

      <h2>Scale Items</h2>
      ${project.items?.map((item: any, idx: number) => `
        <div class="item-box">
          <strong>Item ${idx + 1}:</strong> ${item.content}
          ${item.reversed ? '<span style="color: #f59e0b; font-weight: bold;"> [Reversed]</span>' : ''}
          ${item.subscale ? `<span style="color: #6b7280;"> (${item.subscale})</span>` : ''}
        </div>
      `).join('') || '<p>No items defined</p>'}

      ${results.itemAnalysis && results.itemAnalysis.length > 0 ? `
      <h2>Comprehensive Item Analysis</h2>
      <table style="font-size: 11px;">
        <thead>
          <tr>
            <th>Item</th>
            <th>Mean</th>
            <th>SD</th>
            <th>r<sub>it</sub></th>
            <th>r<sub>it-corrected</sub></th>
            <th>Difficulty</th>
            <th>Discrimination</th>
            <th>α if Deleted</th>
            <th>Quality</th>
          </tr>
        </thead>
        <tbody>
          ${results.itemAnalysis.map((item: any, idx: number) => {
            const quality = item.correctedItemTotal >= 0.5 ? 'Excellent' :
                           item.correctedItemTotal >= 0.3 ? 'Good' :
                           item.correctedItemTotal >= 0.2 ? 'Fair' : 'Poor';
            const qualityColor = item.correctedItemTotal >= 0.3 ? '#10b981' : '#ef4444';
            return `
            <tr>
              <td style="font-weight: bold;">Item ${idx + 1}</td>
              <td>${item.mean?.toFixed(2) || 'N/A'}</td>
              <td>${item.sd?.toFixed(2) || 'N/A'}</td>
              <td>${item.itemTotal?.toFixed(3) || 'N/A'}</td>
              <td style="font-weight: bold;">${item.correctedItemTotal?.toFixed(3) || 'N/A'}</td>
              <td>${item.difficulty?.toFixed(3) || 'N/A'}</td>
              <td>${item.discrimination?.toFixed(3) || 'N/A'}</td>
              <td>${item.alpha_if_deleted?.toFixed(3) || 'N/A'}</td>
              <td style="color: ${qualityColor}; font-weight: bold;">${quality}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>

      <div class="guideline">
        <h3>Comprehensive Item Analysis Interpretation</h3>
        <ul>
          <li><strong>r<sub>it</sub> (Item-Total Correlation):</strong> Overall correlation with total score</li>
          <li><strong>r<sub>it-corrected</sub> (Corrected Item-Total):</strong> Correlation excluding the item itself
            <ul style="margin-left: 20px; font-size: 11px;">
              <li>&gt; 0.50: Excellent discrimination</li>
              <li>0.30-0.50: Good discrimination (keep)</li>
              <li>0.20-0.30: Marginal (review)</li>
              <li>&lt; 0.20: Poor (consider removing)</li>
            </ul>
          </li>
          <li><strong>Difficulty Index:</strong> Mean/Max ratio (0.0-1.0)
            <ul style="margin-left: 20px; font-size: 11px;">
              <li>0.30-0.70: Optimal range for discrimination</li>
              <li>&lt; 0.30 or &gt; 0.70: May reduce scale's ability to discriminate</li>
            </ul>
          </li>
          <li><strong>Discrimination Index:</strong> Difference between upper and lower groups
            <ul style="margin-left: 20px; font-size: 11px;">
              <li>&gt; 0.40: Very good discriminating power</li>
              <li>0.30-0.40: Good discriminating power</li>
              <li>0.20-0.30: Marginal (review item)</li>
              <li>&lt; 0.20: Poor (revise or remove)</li>
            </ul>
          </li>
          <li><strong>α if Deleted:</strong> Reliability if item is removed
            <ul style="margin-left: 20px; font-size: 11px;">
              <li>If substantially higher than overall α: Consider removing item</li>
              <li>If similar or lower: Item contributes to reliability</li>
            </ul>
          </li>
        </ul>
      </div>
      ` : ''}

      ${results.percentiles ? `
      <h2>Normative Percentiles</h2>
      <table>
        <thead>
          <tr>
            <th>Percentile</th>
            <th>Score</th>
            <th>Interpretation</th>
          </tr>
        </thead>
        <tbody>
          ${[10, 25, 50, 75, 90, 95].map(p => `
            <tr>
              <td>${p}th</td>
              <td>${results.percentiles[p]?.toFixed(2) || 'N/A'}</td>
              <td>${
                p >= 90 ? 'Very High' :
                p >= 75 ? 'High' :
                p >= 25 ? 'Average' :
                p >= 10 ? 'Low' : 'Very Low'
              }</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}

      ${results.factorAnalysis ? `
      <h2>Exploratory Factor Analysis (EFA)</h2>

      <h3>Eigenvalues and Variance Explained</h3>
      <table>
        <thead>
          <tr>
            <th>Factor</th>
            <th>Eigenvalue</th>
            <th>% Variance</th>
            <th>Cumulative %</th>
          </tr>
        </thead>
        <tbody>
          ${results.factorAnalysis.eigenvalues.map((eigenvalue: number, idx: number) => {
            const cumulative = results.factorAnalysis.varianceExplained
              .slice(0, idx + 1)
              .reduce((sum: number, val: number) => sum + val, 0);
            return `
            <tr>
              <td style="font-weight: bold;">Factor ${idx + 1}</td>
              <td>${eigenvalue.toFixed(3)}</td>
              <td>${results.factorAnalysis.varianceExplained[idx].toFixed(2)}%</td>
              <td>${cumulative.toFixed(2)}%</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>

      <h3>Factor Loadings Matrix</h3>
      <table style="font-size: 11px;">
        <thead>
          <tr>
            <th>Item</th>
            ${results.factorAnalysis.loadings[0].map((_: any, idx: number) =>
              `<th>Factor ${idx + 1}</th>`
            ).join('')}
            <th>h² (Communality)</th>
          </tr>
        </thead>
        <tbody>
          ${results.factorAnalysis.loadings.map((loadings: number[], itemIdx: number) => `
            <tr>
              <td style="font-weight: bold;">Item ${itemIdx + 1}</td>
              ${loadings.map((loading: number) => {
                const absLoading = Math.abs(loading);
                const color = absLoading >= 0.5 ? '#10b981' : absLoading >= 0.3 ? '#3b82f6' : '#6b7280';
                const weight = absLoading >= 0.5 ? 'bold' : absLoading >= 0.3 ? 'bold' : 'normal';
                return `<td style="color: ${color}; font-weight: ${weight};">${loading.toFixed(3)}</td>`;
              }).join('')}
              <td>${results.factorAnalysis.communalities[itemIdx].toFixed(3)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="guideline">
        <h3>Factor Analysis Interpretation</h3>
        <ul>
          <li><strong>Eigenvalues &gt; 1.0:</strong> Suggests retaining the factor (Kaiser criterion)</li>
          <li><strong>Factor Loadings:</strong>
            <ul style="margin-left: 20px; font-size: 11px;">
              <li>&gt; 0.70: Excellent indicator of the factor</li>
              <li>0.50-0.70: Strong loading</li>
              <li>0.30-0.50: Moderate loading</li>
              <li>&lt; 0.30: Weak loading (consider excluding)</li>
            </ul>
          </li>
          <li><strong>Communality (h²):</strong> Proportion of variance explained
            <ul style="margin-left: 20px; font-size: 11px;">
              <li>&gt; 0.50: Good extraction</li>
              <li>0.25-0.50: Moderate extraction</li>
              <li>&lt; 0.25: Poor extraction (item may not fit)</li>
            </ul>
          </li>
          <li><strong>Total Variance Explained:</strong> Target &gt; 60% for social sciences</li>
        </ul>
      </div>
      ` : ''}

      ${results.interItemCorrelations ? `
      <h2>Inter-Item Correlation Matrix</h2>
      <p style="font-size: 12px; color: #6b7280; margin-bottom: 15px;">
        Correlations between all scale items. High correlations (&gt;0.85) may indicate item redundancy.
      </p>
      <table style="font-size: 10px;">
        <thead>
          <tr>
            <th></th>
            ${results.interItemCorrelations.map((_: any, idx: number) =>
              `<th>${idx + 1}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>
          ${results.interItemCorrelations.map((row: number[], rowIdx: number) => `
            <tr>
              <td style="font-weight: bold;">${rowIdx + 1}</td>
              ${row.map((corr: number, colIdx: number) => {
                if (rowIdx === colIdx) {
                  return '<td style="background-color: #f3f4f6; color: #9ca3af;">-</td>';
                }
                const absCorr = Math.abs(corr);
                let bgColor = '#ffffff';
                let textColor = '#6b7280';
                let weight = 'normal';
                if (absCorr >= 0.85) {
                  bgColor = '#fef3c7'; textColor = '#f59e0b'; weight = 'bold';
                } else if (absCorr >= 0.7) {
                  bgColor = '#d1fae5'; textColor = '#10b981'; weight = 'bold';
                } else if (absCorr >= 0.5) {
                  bgColor = '#dbeafe'; textColor = '#3b82f6';
                } else if (absCorr >= 0.3) {
                  textColor = '#374151';
                }
                return `<td style="background-color: ${bgColor}; color: ${textColor}; font-weight: ${weight};">${corr.toFixed(2)}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="interpretation" style="margin-top: 15px;">
        <h3>Correlation Interpretation</h3>
        <ul style="font-size: 11px;">
          <li><strong>r &gt; 0.85 (Yellow):</strong> Very high correlation - items may be redundant</li>
          <li><strong>r 0.70-0.85 (Green):</strong> High correlation - items measure similar content</li>
          <li><strong>r 0.50-0.70 (Blue):</strong> Moderate correlation - appropriate for scale items</li>
          <li><strong>r 0.30-0.50:</strong> Low to moderate correlation</li>
          <li><strong>r &lt; 0.30:</strong> Low correlation - items may measure different constructs</li>
        </ul>
      </div>
      ` : ''}

      <div class="interpretation">
        <h3>Report Summary</h3>
        <p><strong>Overall Scale Quality:</strong> ${
          results.reliability?.cronbach_alpha >= 0.90 ? 'Excellent - Scale demonstrates outstanding internal consistency and reliability.' :
          results.reliability?.cronbach_alpha >= 0.80 ? 'Good - Scale shows strong psychometric properties suitable for research and clinical use.' :
          results.reliability?.cronbach_alpha >= 0.70 ? 'Acceptable - Scale has adequate reliability for group comparisons and research.' :
          results.reliability?.cronbach_alpha >= 0.60 ? 'Questionable - Scale requires refinement before use in high-stakes contexts.' :
          'Poor - Substantial revision needed. Review item quality and construct definition.'
        }</p>
        ${results.itemAnalysis ? `
        <p><strong>Item Quality:</strong> ${
          results.itemAnalysis.filter((item: any) => item.correctedItemTotal >= 0.3).length
        } of ${results.itemAnalysis.length} items (${
          (results.itemAnalysis.filter((item: any) => item.correctedItemTotal >= 0.3).length / results.itemAnalysis.length * 100).toFixed(1)
        }%) demonstrate good discriminating power (r<sub>it-corrected</sub> ≥ 0.30).</p>
        ` : ''}
        ${results.factorAnalysis ? `
        <p><strong>Factorial Structure:</strong> ${results.factorAnalysis.eigenvalues.filter((e: number) => e > 1.0).length} factors with eigenvalues &gt; 1.0, explaining ${
          results.factorAnalysis.varianceExplained.slice(0, results.factorAnalysis.eigenvalues.filter((e: number) => e > 1.0).length).reduce((sum: number, val: number) => sum + val, 0).toFixed(1)
        }% of total variance.</p>
        ` : ''}
      </div>

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Scale Development Sandbox</p>
        <p>This comprehensive report was automatically generated on ${timestamp}. All statistics calculated using validated psychometric algorithms. Always verify critical results and consult with a psychometrician for important decisions.</p>
        <p><strong>Key References:</strong></p>
        <ul style="font-size: 11px;">
          <li>Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. <em>Psychometrika, 16</em>(3), 297-334.</li>
          <li>McDonald, R. P. (1999). <em>Test theory: A unified treatment.</em> Lawrence Erlbaum Associates.</li>
          <li>Nunnally, J. C., & Bernstein, I. H. (1994). <em>Psychometric theory</em> (3rd ed.). McGraw-Hill.</li>
          <li>DeVellis, R. F. (2016). <em>Scale development: Theory and applications</em> (4th ed.). Sage Publications.</li>
          <li>Tabachnick, B. G., & Fidell, L. S. (2019). <em>Using multivariate statistics</em> (7th ed.). Pearson.</li>
          <li>AERA, APA, & NCME. (2014). <em>Standards for educational and psychological testing.</em> Washington, DC: American Educational Research Association.</li>
        </ul>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Scale_Development_${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
};


export const exportEFAResults = (results: any, config: any) => {
  if (!results || !results.factorLoadings) {
    console.error('No EFA results to export');
    alert('No EFA results available to export. Please run the analysis first.');
    return;
  }

  try {
    const timestamp = new Date().toLocaleString();
    const numFactors = results.numFactors || 0;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>EFA Analysis Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
        h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
        h2 { color: #2563eb; margin-top: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        h3 { color: #3b82f6; margin-top: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #3b82f6; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f3f4f6; }
        .metric-container { display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; }
        .metric-box { flex: 0 0 calc(33.333% - 10px); padding: 15px 20px; border-radius: 8px; background-color: #eff6ff; border-left: 4px solid #3b82f6; }
        .metric-label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #1e40af; }
        .interpretation { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
        .guideline { background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10b981; }
        .loading-excellent { color: #10b981; font-weight: bold; }
        .loading-good { color: #3b82f6; font-weight: bold; }
        .loading-fair { color: #f59e0b; font-weight: bold; }
        .loading-poor { color: #ef4444; font-weight: bold; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        @media print { body { margin: 20px; } .metric-box { page-break-inside: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } }
      </style>
    </head>
    <body>
      <h1>Exploratory Factor Analysis (EFA) Report</h1>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Advanced Psychometric Analysis</p>

      <div class="interpretation">
        <h3>Analysis Overview</h3>
        <p>Exploratory Factor Analysis (EFA) is used to identify the underlying factor structure of a set of observed variables without imposing a preconceived structure on the outcome.</p>
      </div>

      <h2>Analysis Configuration</h2>
      <table>
        <tr><th>Parameter</th><th>Value</th></tr>
        <tr><td>Extraction Method</td><td>${config?.extractionMethod?.toUpperCase() || 'PAF'}</td></tr>
        <tr><td>Rotation Method</td><td>${config?.rotationMethod || 'Promax'}</td></tr>
        <tr><td>Number of Factors</td><td>${numFactors}</td></tr>
        <tr><td>Factor Retention</td><td>${config?.factorRetention || 'Parallel Analysis'}</td></tr>
      </table>

      <h2>Sample Adequacy Tests</h2>
      <div class="metric-container">
        <div class="metric-box">
          <div class="metric-label">Kaiser-Meyer-Olkin (KMO)</div>
          <div class="metric-value">${results.kmo?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">${
            results.kmo >= 0.90 ? 'Marvelous' :
            results.kmo >= 0.80 ? 'Meritorious' :
            results.kmo >= 0.70 ? 'Middling' :
            results.kmo >= 0.60 ? 'Mediocre' :
            results.kmo >= 0.50 ? 'Miserable' : 'Unacceptable'
          }</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Bartlett's Test χ²</div>
          <div class="metric-value">${results.bartlett?.chisq?.toFixed(2) || 'N/A'}</div>
          <div class="metric-label">df = ${results.bartlett?.df || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Bartlett's p-value</div>
          <div class="metric-value">${results.bartlett?.pvalue?.toExponential(3) || 'N/A'}</div>
          <div class="metric-label">${results.bartlett?.pvalue < 0.05 ? 'Significant' : 'Not Significant'}</div>
        </div>
      </div>

      <div class="guideline">
        <h3>Sample Adequacy Interpretation</h3>
        <ul>
          <li><strong>KMO:</strong>
            <ul>
              <li>≥ 0.90: Marvelous (excellent for factor analysis)</li>
              <li>0.80-0.89: Meritorious (very good)</li>
              <li>0.70-0.79: Middling (adequate)</li>
              <li>0.60-0.69: Mediocre (acceptable)</li>
              <li>0.50-0.59: Miserable (poor)</li>
              <li>< 0.50: Unacceptable (do not proceed with FA)</li>
            </ul>
          </li>
          <li><strong>Bartlett's Test:</strong> Should be significant (p < 0.05) indicating correlations among variables</li>
        </ul>
      </div>

      <h2>Variance Explained</h2>
      <table>
        <thead>
          <tr>
            <th>Factor</th>
            <th>Eigenvalue</th>
            <th>% Variance</th>
            <th>Cumulative %</th>
          </tr>
        </thead>
        <tbody>
          ${results.eigenvalues?.slice(0, numFactors).map((ev: number, i: number) => `
            <tr>
              <td><strong>Factor ${i + 1}</strong></td>
              <td>${ev.toFixed(3)}</td>
              <td>${results.varianceExplained?.[i]?.toFixed(2) || 'N/A'}%</td>
              <td>${results.cumulativeVariance?.[i]?.toFixed(2) || 'N/A'}%</td>
            </tr>
          `).join('') || '<tr><td colspan="4">No variance data available</td></tr>'}
        </tbody>
      </table>

      <div class="interpretation">
        <p><strong>Total Variance Explained:</strong> ${results.totalVariance?.toFixed(2) || 'N/A'}% of the variance in the data is explained by the ${numFactors} extracted factor(s).</p>
      </div>

      <h2>Factor Loadings</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            ${Array.from({ length: numFactors }, (_, i) => `<th>Factor ${i + 1}</th>`).join('')}
            <th>Communality (h²)</th>
          </tr>
        </thead>
        <tbody>
          ${results.factorLoadings?.map((item: any, idx: number) => {
            const comm = results.communalities?.[idx]?.extracted || 0;
            return `
              <tr>
                <td><strong>${item.item}</strong></td>
                ${Array.from({ length: numFactors }, (_, i) => {
                  const loading = item[`factor${i + 1}`] || item[`Factor ${i + 1}`] || 0;
                  const absLoading = Math.abs(loading);
                  const className = absLoading >= 0.60 ? 'loading-excellent' :
                                   absLoading >= 0.40 ? 'loading-good' :
                                   absLoading >= 0.30 ? 'loading-fair' : 'loading-poor';
                  return `<td class="${className}">${typeof loading === 'number' ? loading.toFixed(3) : loading}</td>`;
                }).join('')}
                <td>${typeof comm === 'number' ? comm.toFixed(3) : comm}</td>
              </tr>
            `;
          }).join('') || '<tr><td colspan="100">No factor loading data available</td></tr>'}
        </tbody>
      </table>

      <div class="guideline">
        <h3>Factor Loading Interpretation</h3>
        <ul>
          <li><strong>|λ| ≥ 0.60:</strong> <span class="loading-excellent">Excellent</span> - Strong indicator of the factor</li>
          <li><strong>0.40 ≤ |λ| < 0.60:</strong> <span class="loading-good">Good</span> - Moderate indicator</li>
          <li><strong>0.30 ≤ |λ| < 0.40:</strong> <span class="loading-fair">Fair</span> - Weak indicator (consider removing)</li>
          <li><strong>|λ| < 0.30:</strong> <span class="loading-poor">Poor</span> - Not a meaningful indicator</li>
        </ul>
        <p><strong>Communality (h²):</strong> Proportion of variance in each item explained by the factors. Higher is better (> 0.40 is acceptable).</p>
      </div>

      ${results.factorCorrelations && config?.rotationMethod !== 'varimax' && config?.rotationMethod !== 'quartimax' ? `
      <h2>Factor Correlations</h2>
      <table>
        <thead>
          <tr>
            <th>Factor</th>
            ${Array.from({ length: numFactors }, (_, i) => `<th>Factor ${i + 1}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${results.factorCorrelations?.map((row: number[], i: number) => `
            <tr>
              <td><strong>Factor ${i + 1}</strong></td>
              ${row.map((corr: number) => `<td>${corr.toFixed(3)}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="interpretation">Factor correlations indicate the degree of relationship between factors. High correlations (> 0.30) suggest factors are related (oblique rotation appropriate).</p>
      ` : ''}

      <h2>Recommendations</h2>
      <div class="guideline">
        <ul>
          <li><strong>Model Refinement:</strong> Consider removing items with loadings < 0.40 or those that cross-load on multiple factors</li>
          <li><strong>Factor Naming:</strong> Review items with highest loadings on each factor to determine conceptual themes</li>
          <li><strong>Next Steps:</strong> Confirm the factor structure with Confirmatory Factor Analysis (CFA) on an independent sample</li>
          <li><strong>Internal Consistency:</strong> Calculate Cronbach's alpha for each factor to assess reliability</li>
        </ul>
      </div>

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional Psychometric Analysis Platform</p>
        <p>This report was automatically generated. Please verify results and consult with a psychometrician for critical decisions.</p>
        <p><strong>Key References:</strong></p>
        <ul style="font-size: 11px; margin-top: 10px;">
          <li>Fabrigar, L. R., Wegener, D. T., MacCallum, R. C., & Strahan, E. J. (1999). Evaluating the use of exploratory factor analysis in psychological research. Psychological Methods, 4(3), 272-299.</li>
          <li>Costello, A. B., & Osborne, J. (2005). Best practices in exploratory factor analysis. Practical Assessment, Research, and Evaluation, 10(1), 7.</li>
          <li>Tabachnick, B. G., & Fidell, L. S. (2013). Using multivariate statistics (6th ed.). Boston: Pearson.</li>
          <li>Howard, M. C. (2016). A review of exploratory factor analysis decisions and overview of current practices. International Journal of Human-Computer Interaction, 32(1), 51-62.</li>
        </ul>
      </div>
    </body>
    </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `EFA_Analysis_Report_${new Date().toISOString().split('T')[0]}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error('Error exporting EFA results:', error);
    alert('Error generating EFA report. Please try again.');
  }
};

export const exportPLSSEMResults = (
  model: any,
  measurementResults: any,
  structuralResults: any,
  config: any
) => {
  if (!model || !measurementResults || !structuralResults) {
    console.error('No PLS-SEM results to export');
    alert('No PLS-SEM results available to export. Please run the analysis first.');
    return;
  }

  try {
    const timestamp = new Date().toLocaleString();

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>PLS-SEM Analysis Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
        h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
        h2 { color: #2563eb; margin-top: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        h3 { color: #3b82f6; margin-top: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #3b82f6; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f3f4f6; }
        .metric-container { display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; }
        .metric-box { flex: 0 0 calc(25% - 12px); padding: 15px; border-radius: 8px; background-color: #eff6ff; border-left: 4px solid #3b82f6; }
        .metric-label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
        .metric-value { font-size: 20px; font-weight: bold; color: #1e40af; }
        .excellent { color: #10b981; font-weight: bold; }
        .good { color: #3b82f6; font-weight: bold; }
        .acceptable { color: #f59e0b; font-weight: bold; }
        .poor { color: #ef4444; font-weight: bold; }
        .guideline { background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10b981; }
        .interpretation { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        @media print { body { margin: 20px; } .metric-box { page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      <h1>PLS-SEM Analysis Report</h1>
      <p><strong>Model:</strong> ${model.name || 'Unnamed Model'}</p>
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>Platform:</strong> Psychtrix Web - Advanced PLS-SEM Module</p>

      <h2>Model Specification</h2>
      <p><strong>Constructs:</strong> ${model.constructs?.length || 0}</p>
      <p><strong>Paths:</strong> ${model.paths?.length || 0}</p>
      <p><strong>Weighting Scheme:</strong> ${config.weightingScheme || 'path'}</p>
      <p><strong>Bootstrap Samples:</strong> ${config.bootstrapSamples || 5000}</p>

      <h2>Measurement Model Assessment</h2>

      <h3>Reflective Constructs</h3>
      ${Object.keys(measurementResults.reflective || {}).map(construct => `
        <h4>${construct}</h4>
        <table>
          <thead>
            <tr>
              <th>Indicator</th>
              <th>Loading</th>
              <th>t-value</th>
              <th>p-value</th>
              <th>Reliability (λ²)</th>
            </tr>
          </thead>
          <tbody>
            ${measurementResults.reflective[construct]?.indicators?.map((ind: any) => `
              <tr>
                <td>${ind.name}</td>
                <td class="${Math.abs(ind.loading) >= 0.708 ? 'excellent' : Math.abs(ind.loading) >= 0.60 ? 'good' : 'poor'}">${ind.loading.toFixed(3)}</td>
                <td>${ind.tValue.toFixed(3)}</td>
                <td>${ind.pValue.toFixed(4)}</td>
                <td>${ind.reliability.toFixed(3)}</td>
              </tr>
            `).join('') || ''}
          </tbody>
        </table>
        <div class="metric-container">
          <div class="metric-box">
            <div class="metric-label">Cronbach's α</div>
            <div class="metric-value">${measurementResults.reflective[construct]?.cronbachAlpha?.toFixed(3) || 'N/A'}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Composite Reliability</div>
            <div class="metric-value">${measurementResults.reflective[construct]?.compositeReliability?.toFixed(3) || 'N/A'}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">rho_A</div>
            <div class="metric-value">${measurementResults.reflective[construct]?.rhoA?.toFixed(3) || 'N/A'}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">AVE</div>
            <div class="metric-value">${measurementResults.reflective[construct]?.ave?.toFixed(3) || 'N/A'}</div>
          </div>
        </div>
      `).join('')}

      <div class="guideline">
        <h3>Reliability & Validity Criteria</h3>
        <ul>
          <li><strong>Loadings:</strong> Should be ≥ 0.708 (acceptable ≥ 0.60 for exploratory)</li>
          <li><strong>Cronbach's α:</strong> Should be ≥ 0.70 (≥ 0.60 acceptable for exploratory)</li>
          <li><strong>Composite Reliability:</strong> Should be ≥ 0.70</li>
          <li><strong>rho_A:</strong> Should be ≥ 0.70</li>
          <li><strong>AVE:</strong> Should be ≥ 0.50</li>
        </ul>
      </div>

      <h3>Discriminant Validity - HTMT</h3>
      <table>
        <thead>
          <tr>
            <th>Construct</th>
            ${measurementResults.discriminantValidity?.constructNames?.map((name: string) => `<th>${name}</th>`).join('') || ''}
          </tr>
        </thead>
        <tbody>
          ${measurementResults.discriminantValidity?.htmt?.map((row: number[], i: number) => `
            <tr>
              <td><strong>${measurementResults.discriminantValidity.constructNames[i]}</strong></td>
              ${row.map((val: number, j: number) => `
                <td class="${i === j ? '' : val < 0.85 ? 'excellent' : val < 0.90 ? 'good' : 'poor'}">${val.toFixed(3)}</td>
              `).join('')}
            </tr>
          `).join('') || ''}
        </tbody>
      </table>
      <p class="interpretation"><strong>HTMT Criterion:</strong> Values should be < 0.85 (conservative) or < 0.90 (liberal) to establish discriminant validity.</p>

      <h2>Structural Model Assessment</h2>

      <h3>Path Coefficients</h3>
      <table>
        <thead>
          <tr>
            <th>Path</th>
            <th>Coefficient (β)</th>
            <th>t-value</th>
            <th>p-value</th>
            <th>95% CI</th>
            <th>Significance</th>
          </tr>
        </thead>
        <tbody>
          ${structuralResults.paths?.map((path: any) => `
            <tr>
              <td><strong>${path.from} → ${path.to}</strong></td>
              <td class="${Math.abs(path.coefficient) >= 0.20 ? 'excellent' : Math.abs(path.coefficient) >= 0.10 ? 'good' : 'acceptable'}">${path.coefficient?.toFixed(3) || 'N/A'}</td>
              <td>${path.tValue?.toFixed(3) || 'N/A'}</td>
              <td>${path.pValue?.toFixed(4) || 'N/A'}</td>
              <td>${path.ci ? `[${path.ci[0].toFixed(3)}, ${path.ci[1].toFixed(3)}]` : 'N/A'}</td>
              <td class="${path.pValue < 0.001 ? 'excellent' : path.pValue < 0.01 ? 'good' : path.pValue < 0.05 ? 'acceptable' : 'poor'}">
                ${path.pValue < 0.001 ? '***' : path.pValue < 0.01 ? '**' : path.pValue < 0.05 ? '*' : 'n.s.'}
              </td>
            </tr>
          `).join('') || ''}
        </tbody>
      </table>
      <p><em>*** p < 0.001, ** p < 0.01, * p < 0.05, n.s. = not significant</em></p>

      <h3>Coefficient of Determination (R²)</h3>
      <table>
        <thead>
          <tr>
            <th>Endogenous Construct</th>
            <th>R²</th>
            <th>Adjusted R²</th>
            <th>Q² (Predictive Relevance)</th>
            <th>Assessment</th>
          </tr>
        </thead>
        <tbody>
          ${Object.keys(structuralResults.rSquared || {}).map(construct => `
            <tr>
              <td><strong>${construct}</strong></td>
              <td class="${structuralResults.rSquared[construct] >= 0.67 ? 'excellent' : structuralResults.rSquared[construct] >= 0.33 ? 'good' : 'acceptable'}">${structuralResults.rSquared[construct]?.toFixed(3) || 'N/A'}</td>
              <td>${structuralResults.adjustedRSquared?.[construct]?.toFixed(3) || 'N/A'}</td>
              <td class="${structuralResults.qSquared?.[construct] > 0 ? 'excellent' : 'poor'}">${structuralResults.qSquared?.[construct]?.toFixed(3) || 'N/A'}</td>
              <td>${structuralResults.rSquared[construct] >= 0.67 ? 'Substantial' : structuralResults.rSquared[construct] >= 0.33 ? 'Moderate' : 'Weak'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="guideline">
        <h3>R² Interpretation (Hair et al., 2019)</h3>
        <ul>
          <li><strong>Substantial:</strong> R² ≥ 0.67</li>
          <li><strong>Moderate:</strong> 0.33 ≤ R² < 0.67</li>
          <li><strong>Weak:</strong> 0.19 ≤ R² < 0.33</li>
          <li><strong>Q² > 0:</strong> Model has predictive relevance</li>
        </ul>
      </div>

      <h3>Global Fit Indices</h3>
      <div class="metric-container">
        <div class="metric-box">
          <div class="metric-label">SRMR</div>
          <div class="metric-value">${structuralResults.globalFit?.srmr?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">${structuralResults.globalFit?.srmr < 0.08 ? 'Good fit' : 'Poor fit'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">NFI</div>
          <div class="metric-value">${structuralResults.globalFit?.nfi?.toFixed(3) || 'N/A'}</div>
          <div class="metric-label">${structuralResults.globalFit?.nfi >= 0.90 ? 'Good fit' : 'Needs improvement'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">d_ULS</div>
          <div class="metric-value">${structuralResults.globalFit?.dULS?.toFixed(3) || 'N/A'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">d_G</div>
          <div class="metric-value">${structuralResults.globalFit?.dG?.toFixed(3) || 'N/A'}</div>
        </div>
      </div>

      <h2>Recommendations</h2>
      <div class="guideline">
        <ul>
          <li>Review and potentially remove indicators with loadings < 0.60</li>
          <li>Check for multicollinearity if VIF > 5.0</li>
          <li>Ensure HTMT values are below thresholds for discriminant validity</li>
          <li>Interpret path coefficients considering their effect sizes</li>
          <li>Report Q² values to demonstrate predictive relevance</li>
          <li>Consider mediating or moderating effects if theoretically justified</li>
        </ul>
      </div>

      <div class="footer">
        <p><strong>Psychtrix Web</strong> - Professional PLS-SEM Analysis Platform</p>
        <p>This report was automatically generated. Please verify results and consult methodology literature.</p>
        <p><strong>Key References:</strong></p>
        <ul style="font-size: 11px; margin-top: 10px;">
          <li>Hair, J. F., Risher, J. J., Sarstedt, M., & Ringle, C. M. (2019). When to use and how to report the results of PLS-SEM. European Business Review, 31(1), 2-24.</li>
          <li>Henseler, J., Ringle, C. M., & Sarstedt, M. (2015). A new criterion for assessing discriminant validity in variance-based SEM. Journal of the Academy of Marketing Science, 43, 115-135.</li>
          <li>Ringle, C. M., Sarstedt, M., & Straub, D. W. (2012). Editor's comments: A critical look at the use of PLS-SEM in MIS Quarterly. MIS Quarterly, 36(1), iii-xiv.</li>
          <li>Sarstedt, M., Hair, J. F., Cheah, J. H., Becker, J. M., & Ringle, C. M. (2019). How to specify, estimate, and validate higher-order constructs in PLS-SEM. Australasian Marketing Journal, 27(3), 197-211.</li>
        </ul>
      </div>
    </body>
    </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PLS-SEM_Report_${new Date().toISOString().split('T')[0]}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error('Error exporting PLS-SEM results:', error);
    alert('Error generating PLS-SEM report. Please try again.');
  }
};
