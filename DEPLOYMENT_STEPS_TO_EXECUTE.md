# 🚀 DEPLOYMENT EXECUTION CHECKLIST

## ✅ Files Created
- [x] `Procfile` - Tells Render how to start your app
- [x] `runtime.txt` - Python version for deployment
- [x] Updated `requirements.txt` - Added gunicorn
- [x] Updated `.gitignore` - For security

---

## 📋 NEXT STEPS (Follow in Order)

### STEP 1: Initialize Git (PowerShell)
```powershell
cd "d:\IBM PROJECTS\Nutrition Agent"
git init
git add .
git commit -m "Initial commit: NutriAI Agent deployment ready"
```

### STEP 2: Create GitHub Repository
1. Go to https://github.com/new
2. Repository name: `nutrition-agent`
3. Description: "AI-Powered Nutrition Assistant with IBM Watsonx.ai"
4. **Do NOT** check "Initialize with README" (you already have one)
5. Click "Create repository"

### STEP 3: Connect Local Repo to GitHub
```powershell
git remote add origin https://github.com/YOUR_USERNAME/nutrition-agent.git
git branch -M main
git push -u origin main
```

### STEP 4: Deploy Backend on Render
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your `nutrition-agent` repository
5. Fill in:
   - **Name**: `nutrition-agent-api`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Instance Type**: Free
6. Click "Create Web Service"
7. ⏳ Wait 2-3 minutes for deployment

### STEP 5: Add Environment Variables to Render
After deployment starts:
1. Go to your service → "Environment"
2. Add these variables:
   ```
   IBM_CLOUD_API_KEY=YOUR_API_KEY
   WATSONX_PROJECT_ID=YOUR_PROJECT_ID
   WATSONX_URL=https://au-syd.ml.cloud.ibm.com
   FLASK_ENV=production
   FLASK_SECRET_KEY=your-secure-key
   MAX_TOKENS=1024
   TEMPERATURE=0.7
   ```
3. Save → Service auto-redeploys

### STEP 6: Update Frontend URL
Edit `static/js/app.js`:

**Find:**
```javascript
const API_BASE_URL = 'http://localhost:5000/api';
```

**Replace with:**
```javascript
const API_BASE_URL = 'https://nutrition-agent-api.onrender.com/api';
```

### STEP 7: Commit and Push Changes
```powershell
git add .
git commit -m "Update API URL for production deployment"
git push origin main
```

Your backend will auto-redeploy! ✅

### STEP 8: Test Your Deployment
1. Visit: https://nutrition-agent-api.onrender.com/api/chat
2. You should see a response (or error if API key missing)
3. Check Render dashboard logs for details

---

## 🎉 YOUR DEPLOYMENT URLS

After completing all steps, you'll have:
- **Frontend**: Share this with users
- **Backend API**: https://nutrition-agent-api.onrender.com/api

---

## 🆘 TROUBLESHOOTING

**"Build failed" error?**
→ Check requirements.txt syntax
→ View logs in Render dashboard

**"Module not found" error?**
→ Make sure all imports are in requirements.txt
→ Check Python version matches

**"API_KEY not found" error?**
→ Add environment variables in Render → Environment tab
→ Service auto-redeploys after adding

**Still having issues?**
→ Check: DEPLOYMENT_GUIDE_FREE.md (comprehensive guide)

---

## ⏱️ Total Time: 30-40 minutes

1. Git setup: 5 min
2. GitHub repo: 2 min
3. Push to GitHub: 2 min
4. Render deployment: 5 min
5. Environment variables: 3 min
6. Update frontend: 2 min
7. Push changes: 2 min
8. Testing: 5 min

**Total: ~30 minutes**

---

**Ready? Start with STEP 1! 🚀**
