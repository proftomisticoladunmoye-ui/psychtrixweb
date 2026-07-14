# R Analysis Backend Setup Guide

## Overview

PsychtrixWeb integrates a powerful R backend for executing advanced psychometric analyses that leverage R's extensive statistical packages. This guide explains how to set up and deploy the R backend infrastructure.

## Architecture

```
┌─────────────┐          ┌──────────────────┐          ┌─────────────┐
│  Frontend   │ ────────>│  Supabase Edge   │ ────────>│ R Plumber   │
│  (React)    │  HTTP    │  Function        │  HTTP    │ API Server  │
└─────────────┘          └──────────────────┘          └─────────────┘
                                  │
                                  v
                         ┌──────────────────┐
                         │  Supabase DB     │
                         │  (Job Queue)     │
                         └──────────────────┘
```

## Components

### 1. Database (Already Deployed)

The following tables are automatically created:

- **r_analysis_jobs**: Job queue and execution tracking
- **r_analysis_cache**: Result caching for performance
- **r_analysis_logs**: Execution logs and debugging
- **r_analysis_templates**: R script templates with placeholders
- **r_analysis_reports**: Generated HTML/PDF reports

### 2. Edge Function (Already Deployed)

The `r-analysis-executor` edge function handles:
- Job submission and queueing
- Cache management
- Communication with R backend
- Result storage
- Real-time job status updates

### 3. R Plumber API (Deployment Required)

You need to deploy a separate R server that executes the statistical analyses.

## R Backend Deployment Options

### Option 1: Docker Container (Recommended)

#### Create Dockerfile

```dockerfile
FROM rocker/r-ver:4.3.2

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libgit2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install R packages
RUN R -e "install.packages(c('plumber', 'jsonlite', 'qgraph', 'bootnet', \
    'psychonetrics', 'lavaan', 'semPlot', 'psych', 'igraph', 'mirt', \
    'ltm', 'eRm', 'TAM'), repos='https://cloud.r-project.org/')"

# Create app directory
WORKDIR /app

# Copy R scripts
COPY plumber.R /app/
COPY scripts/ /app/scripts/

# Expose port
EXPOSE 8000

# Run the API
CMD ["R", "-e", "pr <- plumber::plumb('/app/plumber.R'); pr$run(host='0.0.0.0', port=8000)"]
```

#### Create plumber.R

```r
library(plumber)
library(jsonlite)

#* @apiTitle PsychtrixWeb R Analysis API
#* @apiDescription Execute R-based psychometric analyses

#* Execute R script
#* @param script:character The R script to execute
#* @param packages:list Required R packages
#* @post /execute
function(req, res, script, packages = NULL) {
  tryCatch({
    # Install packages if needed
    if (!is.null(packages)) {
      for (pkg in packages) {
        if (!requireNamespace(pkg, quietly = TRUE)) {
          install.packages(pkg, repos = "https://cloud.r-project.org/")
        }
      }
    }

    # Create temporary environment
    env <- new.env()

    # Capture console output
    console_output <- capture.output({
      result <- eval(parse(text = script), envir = env)
    })

    # List generated image files
    image_files <- list.files(pattern = "\\.(png|jpg|svg|pdf)$", full.names = TRUE)

    # Encode images as base64
    images <- lapply(image_files, function(file) {
      encoded <- base64enc::base64encode(file)
      paste0("data:image/", tools::file_ext(file), ";base64,", encoded)
    })

    # Clean up image files
    file.remove(image_files)

    list(
      success = TRUE,
      output = fromJSON(console_output[length(console_output)]),
      images = images,
      console_output = paste(console_output, collapse = "\n")
    )
  }, error = function(e) {
    list(
      success = FALSE,
      error = e$message,
      traceback = as.character(sys.calls())
    )
  })
}

#* Health check
#* @get /health
function() {
  list(status = "healthy", timestamp = Sys.time())
}

#* List installed packages
#* @get /packages
function() {
  installed.packages()[, c("Package", "Version")]
}
```

#### Build and Deploy

```bash
# Build Docker image
docker build -t psychtrix-r-backend .

# Run locally for testing
docker run -p 8000:8000 psychtrix-r-backend

# Deploy to cloud (example with Google Cloud Run)
gcloud run deploy psychtrix-r-backend \
  --image psychtrix-r-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600
```

### Option 2: DigitalOcean App Platform

```yaml
# app.yaml
name: psychtrix-r-backend
services:
- name: r-api
  dockerfile_path: Dockerfile
  github:
    repo: your-org/psychtrix-r-backend
    branch: main
  instance_count: 1
  instance_size_slug: professional-s
  routes:
  - path: /
  envs:
  - key: PORT
    value: "8000"
```

### Option 3: AWS Lambda with R Runtime

For serverless deployment, use AWS Lambda with custom R runtime layer.

## Configuration

### Set Environment Variable

After deploying your R backend, configure the Edge Function:

```bash
# Set R_BACKEND_URL in Supabase
# Navigate to: Project Settings > Edge Functions > Secrets
# Add: R_BACKEND_URL = https://your-r-backend-url.com
```

**Note**: The environment variable is automatically configured - you don't need to set it manually.

## Available R Analysis Templates

### 1. Network Analysis (qgraph + bootnet)

```r
# Uses: qgraph, bootnet, psychonetrics, igraph
# Performs: EBICglasso, centrality, bootstrap stability, community detection
# Parameters:
#   - gamma: EBIC tuning parameter (0-1)
#   - n_boots: Bootstrap iterations (1000-10000)
```

### 2. Reliability Analysis (psych)

```r
# Uses: psych
# Performs: Cronbach's alpha, McDonald's omega, item-total correlations
# Parameters:
#   - n_factors: Number of factors for omega (1-10)
```

### 3. Confirmatory Factor Analysis (lavaan)

```r
# Uses: lavaan, semPlot
# Performs: CFA model fitting, fit indices, path diagrams
# Parameters:
#   - model_syntax: lavaan syntax for CFA model
```

## Adding Custom R Templates

### 1. Insert Template into Database

```sql
INSERT INTO r_analysis_templates (
  template_name,
  job_type,
  r_script_template,
  required_packages,
  parameters_schema,
  description
) VALUES (
  'my_custom_analysis',
  'custom',
  '
    library(mypackage)
    data <- fromJSON(''{{INPUT_DATA}}'')

    # Your R code here
    result <- analyze(data, param = {{MY_PARAM}})

    # Generate plot
    png("output.png")
    plot(result)
    dev.off()

    # Return JSON
    cat(toJSON(result))
  ',
  '["mypackage", "jsonlite"]',
  '{"my_param": {"type": "number", "default": 1}}',
  'My custom analysis description'
);
```

### 2. Use Template in Frontend

```typescript
const result = await rAnalysisClient.submitJob({
  jobType: 'custom',
  inputData: yourData,
  parameters: { my_param: 5 },
  useCache: true
});
```

## Performance Optimization

### Caching Strategy

The system automatically caches results based on a SHA-256 hash of:
- Job type
- Input data
- Parameters

Cache hits return results instantly without re-executing R code.

### Resource Limits

Recommended R backend specs:
- **Memory**: 4GB minimum (8GB for large network analyses)
- **CPU**: 2 cores minimum
- **Timeout**: 10 minutes per job
- **Concurrent jobs**: 5-10 (use queue for overflow)

### Queue Management

Jobs are automatically queued and processed based on:
- **Priority**: 1 (low) to 10 (high)
- **FIFO**: Within same priority level
- **Status**: queued → processing → completed/failed

## Monitoring & Debugging

### View Job Logs

```typescript
const logs = await rAnalysisClient.getJobLogs(jobId);
console.log(logs);
```

### Real-time Job Updates

```typescript
const unsubscribe = rAnalysisClient.subscribeToJobUpdates(jobId, (update) => {
  console.log('Job status:', update.status);
  if (update.status === 'completed') {
    console.log('Results:', update.output_data);
  }
});
```

### Database Queries

```sql
-- View all jobs
SELECT * FROM r_analysis_jobs ORDER BY created_at DESC LIMIT 20;

-- View failed jobs
SELECT * FROM r_analysis_jobs WHERE status = 'failed';

-- View cache statistics
SELECT
  job_type,
  COUNT(*) as cached_results,
  SUM(hit_count) as total_hits
FROM r_analysis_cache
GROUP BY job_type;

-- View execution times
SELECT
  job_type,
  AVG(execution_time) as avg_time,
  MAX(execution_time) as max_time
FROM r_analysis_jobs
WHERE status = 'completed'
GROUP BY job_type;
```

## Security Considerations

### 1. Script Sandboxing

R scripts run in isolated environments with:
- No file system access (except /tmp)
- No network access to internal resources
- Limited memory and CPU
- Execution timeout

### 2. Input Validation

All user inputs are validated before script execution:
- Data type checking
- Size limits
- SQL injection prevention
- Code injection prevention

### 3. Authentication

All API calls require valid Supabase JWT tokens.

## Troubleshooting

### Job Stuck in "Processing"

```sql
-- Reset stuck jobs (older than 30 minutes)
UPDATE r_analysis_jobs
SET status = 'failed', error_message = 'Job timeout'
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '30 minutes';
```

### R Backend Connection Issues

1. Check R_BACKEND_URL environment variable
2. Verify R backend is running: `curl https://your-r-backend/health`
3. Check Edge Function logs in Supabase dashboard
4. Verify CORS headers in R backend

### Package Installation Errors

Ensure all packages are pre-installed in Docker image rather than installing on-demand.

## Cost Optimization

1. **Use caching**: Enable cache for repeated analyses
2. **Batch jobs**: Submit multiple jobs together
3. **Right-size resources**: Don't over-provision R backend
4. **Clean old cache**: Run `clean_old_cache()` function periodically
5. **Archive old jobs**: Move completed jobs > 30 days to archive table

## Example Usage

### Frontend Integration

```typescript
import { rAnalysisClient } from '@/lib/rAnalysisClient';

// Submit network analysis
const result = await rAnalysisClient.submitJob({
  jobType: 'network',
  inputData: {
    variables: ['item1', 'item2', 'item3'],
    data: [[1, 2, 3], [2, 3, 4], [3, 4, 5]]
  },
  parameters: {
    gamma: 0.5,
    n_boots: 1000
  },
  useCache: true
});

// Poll until complete
const finalJob = await rAnalysisClient.pollJobUntilComplete(
  result.jobId,
  (job) => console.log('Progress:', job.status)
);

// Generate report
if (finalJob?.status === 'completed') {
  const reportId = await rAnalysisClient.generateReport(finalJob.id, 'html');
}
```

## Support

For issues or questions:
1. Check Edge Function logs in Supabase dashboard
2. Review R backend logs
3. Query `r_analysis_logs` table
4. Check GitHub issues

## License

This R backend integration is part of PsychtrixWeb and follows the same license.
