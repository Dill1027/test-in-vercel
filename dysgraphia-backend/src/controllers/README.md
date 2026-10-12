# Backend - Controllers

This directory contains all controller files responsible for handling HTTP requests and responses.

## Controllers Overview

### authController.js
- Guardian/Parent registration
- Login and logout
- Password reset
- Session management

### childProfileController.js
- Create/edit child profile
- Manage child information
- Retrieve child details
- Delete profile

### assessmentController.js
- Initiate assessment tasks
- Retrieve assessment task definitions
- Track assessment progress
- Store assessment results

### gameController.js
- Get available games
- Start/end game sessions
- Record game interactions
- Calculate game scores

### handwritingController.js
- Upload handwriting strokes
- Request handwriting analysis
- Verify handwriting correctness
- Retrieve analysis results

### dashboardController.js
- Fetch performance metrics
- Get progress trends
- Retrieve dashboard data
- Calculate statistics

### reportController.js
- Generate progress reports
- Get report history
- Export reports (PDF/CSV)
- Share reports with stakeholders

### ttsController.js
- Generate speech audio
- Get voice instructions
- Manage voice content
- Stream audio files

## Usage Pattern
Each controller follows a standard pattern:
1. Request validation
2. Business logic delegation to services
3. Response formatting
4. Error handling
