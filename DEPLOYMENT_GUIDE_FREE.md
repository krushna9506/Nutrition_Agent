# 🚀 NutriAI Agent — Complete Deployment Guide (FREE)

## Overview

This guide covers deploying your NutriAI Agent (Flask backend + Bootstrap frontend) **completely FREE** using Render.com.

**Why Render.com?**
✅ Free tier includes 1 web service + 1 static site  
✅ Automatic deployments from GitHub  
✅ Built-in SSL/HTTPS  
✅ No credit card required for free tier  
✅ Easy environment variable management  
✅ Perfect for Flask + LLM applications  

---

## OPTION 1: RENDER.COM (RECOMMENDED) ⭐

### Step 1: Prepare Your Project for Deployment

#### 1.1 Create a `Procfile` (tells Render how to start your app)

Create a new file named `Procfile` in your project root:

```
web: gunicorn app:app
```

This tells Render to use Gunicorn as the production WSGI server.

#### 1.2 Create `runtime.txt` (specify Python version)

Create a new file named `runtime.txt`:

```
python-3.12.0
```

#### 1.3 Update `requirements.txt` (add production server)

Add `gunicorn` to your `requirements.txt`:

```
setuptools>=75.0.0
flask==3.0.3
flask-cors==4.0.1
python-dotenv==1.0.1
ibm-watsonx-ai==1.5.14
ibm-cloud-sdk-core==3.25.0
requests>=2.32.4
gunicorn==22.0.0
```

#### 1.4 Verify Your Project Structure

```
Nutrition Agent/
├── app.py
├── agent_instructions.py
├── requirements.txt
├── Procfile                    ← NEW
├── runtime.txt                 ← NEW
├── .gitignore
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── css/style.css
    └── js/app.js
```

---

### Step 2: Push to GitHub

#### 2.1 Initialize Git (if not already done)

```bash
cd "d:\IBM PROJECTS\Nutrition Agent"
git init
git add .
git commit -m "Initial commit: NutriAI Agent"
```

#### 2.2 Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository named `nutrition-agent`
3. Do NOT initialize with README (you already have one)

#### 2.3 Connect Local Repo to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/nutrition-agent.git
git branch -M main
git push -u origin main
```

---

### Step 3: Deploy Backend on Render.com

#### 3.1 Sign Up for Render.com

1. Go to https://render.com
2. Click "Sign up"
3. Connect your GitHub account
4. Authorize Render to access your repositories

#### 3.2 Create a Web Service

1. Click "New +" → "Web Service"
2. Connect your `nutrition-agent` repository
3. Fill in deployment details:

   | Field | Value |
   |-------|-------|
   | **Name** | `nutrition-agent-api` |
   | **Environment** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `gunicorn app:app` |
   | **Instance Type** | `Free` |

4. Click "Create Web Service"

#### 3.3 Set Environment Variables

1. In Render dashboard → Your service → "Environment"
2. Add the following variables:

   ```
   IBM_CLOUD_API_KEY=YOUR_API_KEY_HERE
   WATSONX_PROJECT_ID=YOUR_PROJECT_ID_HERE
   WATSONX_URL=https://au-syd.ml.cloud.ibm.com
   FLASK_ENV=production
   FLASK_SECRET_KEY=your-secure-random-key-here
   MAX_TOKENS=1024
   TEMPERATURE=0.7
   ```

3. Click "Save"

**Where to find these values?**
- `IBM_CLOUD_API_KEY`: From your IBM Cloud account
- `WATSONX_PROJECT_ID`: From IBM Watsonx.ai project settings
- `FLASK_SECRET_KEY`: Generate a random string using:
  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```

#### 3.4 Wait for Deployment

Render will automatically:
1. Clone your repository
2. Install dependencies
3. Start your Flask app
4. Generate a URL like: `https://nutrition-agent-api.onrender.com`

**Check deployment status:** Your service dashboard shows build logs in real-time

---

### Step 4: Deploy Frontend on Render (Static Site)

#### 4.1 Modify Frontend for Production

Edit `static/js/app.js` to use the deployed backend URL:

**Replace this:**
```javascript
const API_BASE_URL = 'http://localhost:5000/api';
```

**With this:**
```javascript
const API_BASE_URL = 'https://nutrition-agent-api.onrender.com/api';
```

#### 4.2 Create Frontend Repository

1. Create a new GitHub repo named `nutrition-agent-frontend`
2. Clone it locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nutrition-agent-frontend.git
   cd nutrition-agent-frontend
   ```

3. Copy these files to the frontend repo:
   ```
   templates/index.html  →  index.html
   static/css/style.css  →  css/style.css
   static/js/app.js      →  js/app.js
   ```

4. Create directory structure:
   ```
   nutrition-agent-frontend/
   ├── index.html
   ├── css/
   │   └── style.css
   └── js/
       └── app.js
   ```

5. Push to GitHub:
   ```bash
   git add .
   git commit -m "Initial frontend deployment"
   git push origin main
   ```

#### 4.3 Deploy Frontend on Render

1. Click "New +" → "Static Site"
2. Connect your `nutrition-agent-frontend` repository
3. Fill in details:

   | Field | Value |
   |-------|-------|
   | **Name** | `nutrition-agent-web` |
   | **Build Command** | `# (leave empty)` |
   | **Publish Directory** | `.` |

4. Click "Create Static Site"

**Your frontend will be available at:** `https://nutrition-agent-web.onrender.com`

---

### Step 5: Configure CORS (Important!)

Your Flask backend needs to allow requests from the frontend.

Edit `app.py` and update CORS configuration:

```python
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "https://nutrition-agent-web.onrender.com",
            "http://localhost:3000",
            "http://localhost:5000"
        ]
    }
})
```

Push this change to GitHub - Render will auto-redeploy.

---

### Step 6: Test Your Deployment

1. **Visit your frontend:** https://nutrition-agent-web.onrender.com
2. **Test the chat:** Try asking "Hello, I want to lose weight"
3. **Check backend logs:** View on Render dashboard

---

## OPTION 2: RAILWAY.APP (ALTERNATIVE)

Railway gives $5 free monthly credit + easy deployment.

### Quick Setup

1. Go to https://railway.app
2. Click "Start a New Project"
3. Choose "Deploy from GitHub repo"
4. Select your `nutrition-agent` repository
5. Railway auto-detects it's a Python/Flask app
6. Add environment variables (same as Render)
7. Deploy automatically

**Cost:** $5/month free credit (covers most small apps)

---

## OPTION 3: REPLIT (SIMPLEST)

Replit is the easiest for quick deployment.

### Quick Setup

1. Go to https://replit.com
2. Click "Create" → "Import from GitHub"
3. Paste your repo URL
4. Click "Import"
5. Add environment variables in "Secrets"
6. Click "Run"
7. Replit generates a public URL automatically

**Pros:** Easiest, no configuration needed
**Cons:** Slower performance, goes to sleep after inactivity

---

## OPTION 4: PYTHONANYWHERE (PYTHON-SPECIFIC)

Best if you want a simple Python hosting platform.

### Quick Setup

1. Go to https://www.pythonanywhere.com
2. Sign up (free account)
3. Go to "Web" → "Add a new web app"
4. Choose Flask + Python 3.12
5. Upload your code via Git:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nutrition-agent.git
   ```
6. Configure WSGI file
7. Enable HTTPS
8. Set environment variables in Web tab
9. Reload your web app

---

## COMMON ISSUES & FIXES

### Issue 1: "Module not found" error

**Problem:** Dependencies not installed  
**Fix:** Ensure `requirements.txt` is in root directory and contains all packages

### Issue 2: "IBM_CLOUD_API_KEY not found"

**Problem:** Environment variables not set  
**Fix:** Add in Render dashboard → Environment variables

### Issue 3: CORS errors in browser console

**Problem:** Frontend can't call backend API  
**Fix:** Update CORS configuration in `app.py` with correct frontend URL

### Issue 4: Service won't start

**Problem:** Check Render/Railway logs  
**Fix:** 
```bash
# Test locally first
python app.py

# Check for syntax errors
python -m py_compile app.py
```

### Issue 5: Cold start timeout

**Problem:** App takes too long to start on free tier  
**Fix:** Use Render's "Keep-Alive" feature or upgrade to paid tier

---

## PERFORMANCE OPTIMIZATION

### For Free Tier:

1. **Minimize dependencies** (reduces startup time)
2. **Use caching** in frontend (reduce API calls)
3. **Keep model prompts concise** (faster LLM inference)
4. **Compress CSS/JS** (faster downloads)

### Frontend Optimization:

Add to `templates/index.html` before closing `</body>`:

```html
<script>
  // Cache API responses
  const cache = new Map();
  
  async function cachedFetch(url, options = {}) {
    if (cache.has(url)) {
      return cache.get(url);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    cache.set(url, data);
    return data;
  }
</script>
```

---

## MONITORING & MAINTENANCE

### Set Up Monitoring:

**Render Dashboard:**
- View real-time logs
- Monitor CPU/Memory usage
- Check deployment history

**GitHub Integration:**
- Every push to `main` auto-deploys
- Rollback to previous versions if needed

### Regular Updates:

1. Update dependencies monthly:
   ```bash
   pip list --outdated
   ```

2. Check for security vulnerabilities:
   ```bash
   pip-audit
   ```

3. Monitor IBM Watsonx API usage:
   - Check IBM Cloud dashboard
   - Set up usage alerts

---

## SCALING UP (When Ready)

If your free tier runs out of resources:

**Render Upgrade:**
- Pay $7/month for small instance
- Get more CPU/RAM
- No cold starts

**Alternative Platforms:**
- AWS Lambda (pay per request)
- Google Cloud Run (pay per request)
- Azure App Service (free tier available)

---

## DOMAIN NAME (OPTIONAL)

### Free Domain Options:

1. **GitHub Pages** (only for static sites)
2. **Freenom** (free .ml, .ga, .cf domains)
3. **Render custom domain** ($10/month)

### Connect Domain to Render:

1. Render dashboard → Settings → Custom Domains
2. Add your domain name
3. Update DNS records at registrar
4. SSL certificate auto-generated

---

## SECURITY CHECKLIST

✅ Store API keys in environment variables (not in code)
✅ Enable HTTPS (auto on Render)
✅ Set FLASK_ENV=production
✅ Use strong FLASK_SECRET_KEY
✅ Validate user inputs
✅ Rate limit API endpoints
✅ Monitor error logs
✅ Keep dependencies updated

---

## FINAL DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] Created `Procfile`
- [ ] Created `runtime.txt`
- [ ] Added `gunicorn` to `requirements.txt`
- [ ] Pushed to GitHub
- [ ] Created Render account
- [ ] Deployed backend on Render
- [ ] Set environment variables
- [ ] Deployed frontend on Render
- [ ] Updated CORS in app.py
- [ ] Updated API URL in frontend
- [ ] Tested chat functionality
- [ ] Checked browser console for errors
- [ ] Verified backend logs show requests
- [ ] Tested on mobile device

---

## QUICK COMMAND REFERENCE

```bash
# Test locally
python app.py

# Install production dependencies
pip install -r requirements.txt

# Check Python version
python --version

# Generate secure secret key
python -c "import secrets; print(secrets.token_hex(32))"

# Check git status
git status

# Commit and push changes
git add .
git commit -m "deployment changes"
git push origin main
```

---

## ESTIMATED COSTS

| Service | Free Tier | Cost |
|---------|-----------|------|
| **Render Backend** | 1 web service | $0/month |
| **Render Frontend** | 1 static site | $0/month |
| **Domain** | Custom domain | $0 (Freenom) |
| **IBM Watsonx API** | Pay-as-you-go | Depends on usage |
| **TOTAL** | - | **$0 + API costs** |

**IBM Watsonx.ai costs:**
- Depends on model & usage
- Check IBM Cloud pricing dashboard
- Most free tier is around $0-50/month for low volume

---

## TROUBLESHOOTING DEPLOYMENT

### "Build failed" error

Check these:
1. `requirements.txt` syntax correct?
2. All imports available?
3. No relative imports?

Fix:
```bash
pip install -r requirements.txt  # Test locally first
```

### App crashes after deployment

Check logs in Render:
1. Go to service dashboard
2. Click "Logs" tab
3. Look for error messages
4. Common issue: Missing environment variable

Fix:
```bash
# Add to Render environment variables
IBM_CLOUD_API_KEY=your_key_here
```

### Frontend can't reach backend

1. Check frontend is calling correct URL
2. Verify CORS enabled in backend
3. Test API directly in browser:
   ```
   https://nutrition-agent-api.onrender.com/api/chat
   ```

---

## SUPPORT & DOCUMENTATION

- **Render Docs:** https://render.com/docs
- **Flask Docs:** https://flask.palletsprojects.com
- **IBM Watsonx:** https://cloud.ibm.com/docs/watsonx
- **Bootstrap Docs:** https://getbootstrap.com/docs

---

## NEXT STEPS AFTER DEPLOYMENT

1. **Share your app:** Send frontend URL to friends
2. **Monitor performance:** Watch Render dashboard
3. **Collect feedback:** How users interact with NutriAI
4. **Plan enhancements:** Based on usage patterns
5. **Scale if needed:** Upgrade to paid tier if needed

---

## SUCCESS! 🎉

Your NutriAI Agent is now live and accessible to the world!

**Your URLs:**
- **Frontend:** https://nutrition-agent-web.onrender.com
- **Backend API:** https://nutrition-agent-api.onrender.com/api
- **GitHub:** https://github.com/YOUR_USERNAME/nutrition-agent

Share these links with friends and collect feedback!

---

**Questions?** Check Render.com docs or Flask documentation linked above.

**End of Deployment Guide**
