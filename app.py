# ============================================================
#  NutriAI Agent — Flask Backend with IBM Watsonx.ai
# ============================================================
#  Author     : Krushna Donge (MIT Student)
#  Created    : 2026
#  License    : MIT
#  Repository : https://github.com/krushna9506/Nutrition_Agent
#  File       : app.py
#  Model      : meta-llama/llama-3-3-70b-instruct  (au-syd)
#  SDK        : ibm-watsonx-ai  >=1.5.x
#  API used   : ModelInference.chat()  — structured messages
#  Credentials: loaded from .env via python-dotenv
# ============================================================
import os
import logging
from pathlib import Path
from datetime import datetime

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

# --- IBM Watsonx.ai SDK ---
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

# --- Agent persona / system prompt ---
from agent_instructions import get_system_prompt

# ============================================================
#  ENVIRONMENT
# ============================================================
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

IBM_CLOUD_API_KEY  = os.getenv("IBM_CLOUD_API_KEY",  "")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL        = os.getenv("WATSONX_URL",        "https://au-syd.ml.cloud.ibm.com")
FLASK_SECRET_KEY   = os.getenv("FLASK_SECRET_KEY",   "dev-secret-key")
FLASK_PORT         = int(os.getenv("FLASK_PORT",  5000))
MAX_TOKENS         = int(os.getenv("MAX_TOKENS",  2048))
TEMPERATURE        = float(os.getenv("TEMPERATURE", 0.7))

# ============================================================
#  FLASK APP & DATABASE
# ============================================================
app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
CORS(app)

db_url = os.getenv("DATABASE_URL", "sqlite:///nutriai.db")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+pg8000://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+pg8000://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# --- Models ---
class UserProfileModel(db.Model):
    __tablename__ = "user_profiles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=True)
    age = db.Column(db.Integer, nullable=True)
    gender = db.Column(db.String(20), nullable=True)
    weight = db.Column(db.Float, nullable=True)
    height = db.Column(db.Float, nullable=True)
    goal = db.Column(db.String(50), nullable=True)
    diet_type = db.Column(db.String(50), nullable=True)
    health_conditions = db.Column(db.Text, nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    activity = db.Column(db.String(50), nullable=True)
    budget_friendly = db.Column(db.Boolean, default=False)
    preferred_language = db.Column(db.String(30), default="English")
    selected_model = db.Column(db.String(100), default="meta-llama/llama-3-3-70b-instruct")

class FamilyMemberModel(db.Model):
    __tablename__ = "family_members"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    relation = db.Column(db.String(50), nullable=False)
    age = db.Column(db.Integer, nullable=True)
    gender = db.Column(db.String(20), nullable=True)
    weight = db.Column(db.Float, nullable=True)
    height = db.Column(db.Float, nullable=True)
    goal = db.Column(db.String(50), nullable=True)
    activity = db.Column(db.String(50), nullable=True)
    conditions = db.Column(db.Text, nullable=True)

class ChatMessageModel(db.Model):
    __tablename__ = "chat_messages"
    id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class WeightLogModel(db.Model):
    __tablename__ = "weight_logs"
    id = db.Column(db.Integer, primary_key=True)
    weight = db.Column(db.Float, nullable=False)
    bmi = db.Column(db.Float, nullable=False)
    log_date = db.Column(db.Date, default=datetime.utcnow)

# Auto-create tables
with app.app_context():
    db.create_all()

# ============================================================
#  WATSONX.AI — multi-model client registry
# ============================================================
_models: dict[str, ModelInference] = {}

def _is_placeholder(val: str) -> bool:
    v = (val or "").strip()
    return not v or v.startswith("your_")

def _credentials_ok() -> bool:
    return not _is_placeholder(IBM_CLOUD_API_KEY) and not _is_placeholder(WATSONX_PROJECT_ID)

def get_model(model_id: str = "meta-llama/llama-3-3-70b-instruct") -> ModelInference | None:
    """
    Lazy-initialize and return the Watsonx.ai ModelInference client for the requested model.
    """
    global _models
    if model_id in _models:
        return _models[model_id]

    if not _credentials_ok():
        logger.warning(
            "Watsonx.ai credentials not configured — running in offline fallback mode."
        )
        return None

    try:
        credentials = Credentials(url=WATSONX_URL, api_key=IBM_CLOUD_API_KEY)
        client      = APIClient(credentials=credentials, project_id=WATSONX_PROJECT_ID)

        chat_params = {
            "max_tokens":       MAX_TOKENS,
            GenParams.TEMPERATURE:       TEMPERATURE,
            GenParams.TOP_P:             0.9,
            GenParams.REPETITION_PENALTY: 1.05,
        }

        model = ModelInference(
            model_id=model_id,
            api_client=client,
            project_id=WATSONX_PROJECT_ID,
            params=chat_params,
        )
        _models[model_id] = model
        logger.info("Watsonx.ai model ready: %s @ %s", model_id, WATSONX_URL)
        return model

    except Exception as exc:
        logger.error("Watsonx.ai init failed for %s: %s", model_id, exc)
        return None

# ============================================================
#  WATSONX.AI — chat helper
# ============================================================
def _build_messages(
    user_message: str,
    history: list[dict],
    profile: dict | None = None,
    language: str = "English",
    budget_friendly: bool = False,
) -> list[dict]:
    """
    Build the messages list for ModelInference.chat().
    """
    system_content = get_system_prompt()

    # Apply Budget Friendly rules if active
    if budget_friendly:
        system_content += (
            "\n\n### CRITICAL BUDGET-FRIENDLY DIRECTIVE (SOCIO-ECONOMIC AID):\n"
            "The user requires a budget-friendly/affordable nutrition approach. "
            "DO NOT recommend premium, expensive, or imported foods like olive oil, avocado, quinoa, chia seeds, salmon, kale, or expensive supplements.\n"
            "Instead, emphasize cheap, highly nutritious local Indian foods:\n"
            "- Healthy fats: local mustard oil, peanut oil, simple curd/dahi.\n"
            "- Proteins: Sattu (roasted gram flour - poor man's protein), boiled chana, roasted peanuts, sprouts, dal, local eggs, seasonal low-cost vegetables.\n"
            "- Grains: Millets (ragi/nachni, jowar, bajra), brown/white rice, whole wheat roti.\n"
            "- Superfoods: Amla (cheap source of Vitamin C), turmeric, ginger, moringa/drumsticks.\n"
            "Focus on practicality and affordability."
        )

    # Apply Language instructions if active
    if language and language.strip().lower() != "english":
        system_content += (
            f"\n\n### LANGUAGE DIRECTIVE:\n"
            f"You MUST generate your entire response (including recipes, meal plans, calories, and instructions) in the {language} language.\n"
            f"Translate your friendly persona and technical content naturally. For Indian regional languages (e.g. Hindi, Tamil, Telugu, Marathi), write in their native script (e.g. Devanagari for Hindi: हिंदी)."
        )

    # Append user-profile context to the system turn when available
    if profile:
        fields = {
            "Name":              profile.get("name"),
            "Age":               profile.get("age"),
            "Gender":            profile.get("gender"),
            "Weight":            f"{profile.get('weight')} kg" if profile.get("weight") else None,
            "Height":            f"{profile.get('height')} cm" if profile.get("height") else None,
            "Goal":              profile.get("goal"),
            "Diet type":         profile.get("diet_type"),
            "Health conditions": profile.get("health_conditions"),
            "Allergies":         profile.get("allergies"),
            "Activity level":    profile.get("activity"),
        }
        ctx = "\n".join(f"- {k}: {v}" for k, v in fields.items() if v)
        if ctx:
            system_content += f"\n\n### Current User Profile\n{ctx}"

    messages: list[dict] = [{"role": "system", "content": system_content}]

    # Include last 6 history turns (3 user + 3 assistant) for context
    for turn in history[-6:]:
        role = turn.get("role", "user")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": turn.get("content", "")})

    messages.append({"role": "user", "content": user_message})
    return messages


def call_watsonx(
    user_message: str,
    history: list[dict] | None = None,
    profile: dict | None = None,
    model_id: str = "meta-llama/llama-3-3-70b-instruct",
    language: str = "English",
    budget_friendly: bool = False,
) -> str:
    """
    Call the Watsonx.ai chat API and return the assistant reply string.
    """
    model = get_model(model_id)
    if model is None:
        return _offline_chat(user_message)

    messages = _build_messages(user_message, history or [], profile, language, budget_friendly)

    try:
        result = model.chat(messages=messages)
        reply = (
            result
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        if not reply:
            raise ValueError("Empty response from Watsonx.ai")
        logger.info("Watsonx.ai chat OK (%d chars) using %s", len(reply), model_id)
        return reply

    except Exception as exc:
        logger.error("Watsonx.ai chat error for %s: %s", model_id, exc)
        return _offline_chat(user_message)


# ============================================================
#  OFFLINE FALLBACKS  (shown when AI is unavailable)
# ============================================================

def _offline_chat(message: str) -> str:
    """Keyword-based fallback reply when Watsonx.ai is not reachable."""
    msg = message.lower()
    if any(w in msg for w in ["bmi", "weight", "height", "overweight", "underweight"]):
        return (
            "**BMI & Weight Guidance**\n\n"
            "Use the **BMI Calculator** tab for an instant calculation. "
            "Provide your weight (kg) and height (cm) there to get your BMI, "
            "ideal weight range, and personalised advice.\n\n"
            "> AI responses require IBM Watsonx.ai credentials in `.env`."
        )
    if any(w in msg for w in ["meal", "plan", "recipe", "diet", "eat", "food", "sabzi", "dal", "roti"]):
        return (
            "**Meal Planning**\n\n"
            "Head to the **Meal Planner** tab, fill in your profile and goal, "
            "then click **Generate AI Meal Plan** for a personalised Indian meal plan.\n\n"
            "> Full AI generation needs IBM Watsonx.ai credentials in `.env`."
        )
    if any(w in msg for w in ["calorie", "kcal", "macro", "protein", "carb", "fat"]):
        return (
            "**Calorie & Macro Reference**\n\n"
            "| Activity level | Approx. daily need |\n"
            "|---|---|\n"
            "| Sedentary | 1,600–2,000 kcal |\n"
            "| Moderate | 2,000–2,400 kcal |\n"
            "| Very active | 2,400–3,000 kcal |\n\n"
            "Use the **Dashboard** tab to calculate your personal targets.\n\n"
            "> AI responses require IBM Watsonx.ai credentials in `.env`."
        )
    return (
        "**Namaste! I'm NutriAI** — your IBM Watsonx-powered nutrition assistant.\n\n"
        "I can help with:\n"
        "- Personalised meal plans (Indian & International)\n"
        "- Calorie & macro analysis\n"
        "- BMI & weight management\n"
        "- Family nutrition profiles\n"
        "- Special diets: diabetic, vegan, keto, Jain\n\n"
        "> **To activate full AI:** Add your `IBM_CLOUD_API_KEY` and "
        "`WATSONX_PROJECT_ID` to the `.env` file and restart the server."
    )


# ============================================================
#  BMI & CALORIE UTILITIES
# ============================================================

def calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    if height_cm <= 0 or weight_kg <= 0:
        return {"error": "Invalid weight or height"}
    h = height_cm / 100
    bmi = round(weight_kg / h ** 2, 1)
    if   bmi < 18.5: cat, color, advice = "Underweight",     "info",    "Focus on nutrient-dense calorie-rich foods: nuts, full-fat dairy, whole grains."
    elif bmi < 25.0: cat, color, advice = "Normal Weight",   "success", "Great! Maintain your weight with balanced nutrition and regular activity."
    elif bmi < 30.0: cat, color, advice = "Overweight",      "warning", "A modest calorie deficit (300–400 kcal/day) with more movement will help."
    elif bmi < 35.0: cat, color, advice = "Obese (Class I)", "danger",  "Consider consulting a dietitian. Focus on whole foods and reducing processed intake."
    elif bmi < 40.0: cat, color, advice = "Obese (Class II)","danger",  "Medical supervision is recommended for a structured diet and exercise plan."
    else:            cat, color, advice = "Obese (Class III)","danger", "Please work with a healthcare professional for medically supervised management."
    return {
        "bmi": bmi, "category": cat, "color": color, "advice": advice,
        "ideal_weight_min": round(18.5 * h ** 2, 1),
        "ideal_weight_max": round(24.9 * h ** 2, 1),
    }


def calculate_calories(
    weight_kg: float, height_cm: float, age: int,
    gender: str, activity: str, goal: str,
) -> dict:
    # Mifflin-St Jeor BMR
    if gender.lower() in ("male", "m"):
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

    multipliers = {
        "sedentary": 1.2, "light": 1.375, "moderate": 1.55,
        "active": 1.725, "very_active": 1.9,
    }
    tdee = round(bmr * multipliers.get(activity.lower(), 1.55))

    if goal == "lose":
        target = max(tdee - 400, 1200 if gender.lower() in ("female","f") else 1500)
        label  = "Weight Loss"
    elif goal == "gain":
        target, label = tdee + 400, "Weight Gain"
    else:
        target, label = tdee, "Maintenance"

    return {
        "bmr":             round(bmr),
        "tdee":            tdee,
        "target_calories": round(target),
        "goal":            label,
        "protein_g":       round((target * 0.27) / 4),
        "carbs_g":         round((target * 0.45) / 4),
        "fats_g":          round((target * 0.28) / 9),
    }


# ============================================================
#  ROUTES — pages
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    ai_ready = _credentials_ok()
    db_status = "connected"
    try:
        db.session.execute(db.select(1))
    except Exception:
        db_status = "error"
        
    return jsonify({
        "status":      "ok" if db_status == "connected" else "degraded",
        "app":         "NutriAI Agent",
        "version":     "1.1.0",
        "ai_backend":  "watsonx.ai",
        "database":    db_status,
        "ai_ready":    ai_ready,
        "timestamp":   datetime.utcnow().isoformat(),
    })


# ============================================================
#  ROUTES — DATABASE SYNC API
# ============================================================

@app.route("/api/profile", methods=["GET", "POST"])
def profile_api():
    if request.method == "GET":
        profile = UserProfileModel.query.first()
        if not profile:
            return jsonify({})
        return jsonify({
            "name": profile.name,
            "age": profile.age,
            "gender": profile.gender,
            "weight": profile.weight,
            "height": profile.height,
            "goal": profile.goal,
            "diet_type": profile.diet_type,
            "health_conditions": profile.health_conditions,
            "allergies": profile.allergies,
            "activity": profile.activity,
            "budget_friendly": profile.budget_friendly,
            "preferred_language": profile.preferred_language,
            "selected_model": profile.selected_model
        })
    else: # POST
        body = request.get_json(force=True)
        profile = UserProfileModel.query.first()
        if not profile:
            profile = UserProfileModel()
            db.session.add(profile)
        
        profile.name = body.get("name")
        profile.age = int(body.get("age")) if body.get("age") else None
        profile.gender = body.get("gender")
        profile.weight = float(body.get("weight")) if body.get("weight") else None
        profile.height = float(body.get("height")) if body.get("height") else None
        profile.goal = body.get("goal")
        profile.diet_type = body.get("diet_type")
        profile.health_conditions = body.get("health_conditions")
        profile.allergies = body.get("allergies")
        profile.activity = body.get("activity")
        profile.budget_friendly = bool(body.get("budget_friendly"))
        profile.preferred_language = body.get("preferred_language", "English")
        profile.selected_model = body.get("selected_model", "meta-llama/llama-3-3-70b-instruct")
        
        db.session.commit()
        return jsonify({"status": "success", "message": "Profile updated successfully"})


@app.route("/api/family-members", methods=["GET", "POST"])
def family_members_api():
    if request.method == "GET":
        members = FamilyMemberModel.query.all()
        return jsonify([{
            "id": m.id,
            "name": m.name,
            "relation": m.relation,
            "age": m.age,
            "gender": m.gender,
            "weight": m.weight,
            "height": m.height,
            "goal": m.goal,
            "activity": m.activity,
            "conditions": m.conditions
        } for m in members])
    else: # POST
        body = request.get_json(force=True)
        m = FamilyMemberModel(
            name=body.get("name"),
            relation=body.get("relation"),
            age=int(body.get("age")) if body.get("age") else None,
            gender=body.get("gender"),
            weight=float(body.get("weight")) if body.get("weight") else None,
            height=float(body.get("height")) if body.get("height") else None,
            goal=body.get("goal"),
            activity=body.get("activity"),
            conditions=body.get("conditions")
        )
        db.session.add(m)
        db.session.commit()
        return jsonify({"status": "success", "id": m.id})


@app.route("/api/family-members/<int:member_id>", methods=["DELETE"])
def delete_family_member(member_id):
    m = db.session.get(FamilyMemberModel, member_id)
    if not m:
        return jsonify({"error": "Member not found"}), 404
    db.session.delete(m)
    db.session.commit()
    return jsonify({"status": "success"})


@app.route("/api/chat-history", methods=["GET", "DELETE"])
def chat_history_api():
    if request.method == "GET":
        messages = ChatMessageModel.query.order_by(ChatMessageModel.timestamp.asc()).all()
        return jsonify([{
            "role": m.role,
            "content": m.content,
            "timestamp": m.timestamp.isoformat()
        } for m in messages])
    else: # DELETE
        ChatMessageModel.query.delete()
        db.session.commit()
        return jsonify({"status": "success"})


@app.route("/api/weight-logs", methods=["GET", "POST"])
def weight_logs_api():
    if request.method == "GET":
        logs = WeightLogModel.query.order_by(WeightLogModel.log_date.asc()).all()
        return jsonify([{
            "id": l.id,
            "weight": l.weight,
            "bmi": l.bmi,
            "date": l.log_date.isoformat()
        } for l in logs])
    else: # POST
        body = request.get_json(force=True)
        try:
            w = float(body.get("weight"))
            h = float(body.get("height"))
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid weight or height"}), 400
        
        bmi_info = calculate_bmi(w, h)
        if "error" in bmi_info:
            return jsonify({"error": bmi_info["error"]}), 400
            
        log = WeightLogModel(weight=w, bmi=bmi_info["bmi"])
        db.session.add(log)
        db.session.commit()
        return jsonify({
            "status": "success",
            "log": {
                "id": log.id,
                "weight": log.weight,
                "bmi": log.bmi,
                "date": log.log_date.isoformat()
            }
        })


# ============================================================
#  ROUTES — AI NUTRITION API
# ============================================================

@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Conversational endpoint.
    """
    body    = request.get_json(force=True)
    message = (body.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > 2000:
        return jsonify({"error": "message too long (max 2000 chars)"}), 400

    history = body.get("history") or []
    profile = body.get("profile") or {}
    
    # Dynamic parameter overrides
    selected_model = profile.get("selected_model", "meta-llama/llama-3-3-70b-instruct")
    language = profile.get("preferred_language", "English")
    budget_friendly = profile.get("budget_friendly", False)

    try:
        # Save user message to database
        user_msg = ChatMessageModel(role="user", content=message)
        db.session.add(user_msg)
        db.session.commit()

        reply = call_watsonx(
            message,
            history=history,
            profile=profile,
            model_id=selected_model,
            language=language,
            budget_friendly=budget_friendly
        )

        # Save assistant message to database
        ai_msg = ChatMessageModel(role="assistant", content=reply)
        db.session.add(ai_msg)
        db.session.commit()

        return jsonify({"response": reply, "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Chat route error: %s", exc)
        return jsonify({"error": "Failed to generate response. Please try again."}), 500


@app.route("/api/bmi", methods=["POST"])
def bmi_route():
    body = request.get_json(force=True)
    try:
        weight = float(body.get("weight_kg", 0))
        height = float(body.get("height_cm", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid weight or height"}), 400

    result = calculate_bmi(weight, height)
    return (jsonify(result), 400) if "error" in result else jsonify(result)


@app.route("/api/calories", methods=["POST"])
def calories_route():
    body = request.get_json(force=True)
    try:
        weight   = float(body.get("weight_kg", 0))
        height   = float(body.get("height_cm", 0))
        age      = int(body.get("age", 0))
        gender   = str(body.get("gender",   "male"))
        activity = str(body.get("activity", "moderate"))
        goal     = str(body.get("goal",     "maintain"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid input"}), 400

    if not all([weight > 0, height > 0, age > 0]):
        return jsonify({"error": "weight, height and age must be positive"}), 400

    return jsonify(calculate_calories(weight, height, age, gender, activity, goal))


@app.route("/api/meal-plan", methods=["POST"])
def meal_plan_route():
    body        = request.get_json(force=True)
    profile     = body.get("profile") or {}
    days        = min(int(body.get("days", 7)), 7)
    preferences = (body.get("preferences") or "").strip()

    name   = profile.get("name",   "Friend")
    age    = profile.get("age",    "")
    gender = profile.get("gender", "")
    weight = profile.get("weight", "")
    height = profile.get("height", "")
    goal   = profile.get("goal",   "maintenance")
    diet   = profile.get("diet_type",         "balanced vegetarian")
    health = profile.get("health_conditions", "none")

    selected_model = profile.get("selected_model", "meta-llama/llama-3-3-70b-instruct")
    language = profile.get("preferred_language", "English")
    budget_friendly = profile.get("budget_friendly", False)

    prompt = (
        f"Create a detailed {days}-day personalised Indian meal plan for:\n"
        f"Name: {name} | Age: {age} | Gender: {gender} | "
        f"Weight: {weight} kg | Height: {height} cm\n"
        f"Goal: {goal} | Diet: {diet} | Health conditions: {health}\n"
        f"Additional preferences: {preferences or 'none'}\n\n"
        f"For EACH day include:\n"
        f"- Breakfast with approximate calories\n"
        f"- Mid-morning snack\n"
        f"- Lunch with approximate calories\n"
        f"- Evening snack\n"
        f"- Dinner with approximate calories\n"
        f"- Total daily calories\n\n"
        f"Use authentic Indian dish names. Be specific with quantities (e.g. 2 rotis, 1 katori dal)."
    )

    try:
        reply = call_watsonx(
            prompt,
            history=[],
            profile=profile,
            model_id=selected_model,
            language=language,
            budget_friendly=budget_friendly
        )
        return jsonify({"meal_plan": reply, "days": days, "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Meal plan error: %s", exc)
        return jsonify({"error": "Failed to generate meal plan"}), 500


@app.route("/api/family-plan", methods=["POST"])
def family_plan_route():
    body    = request.get_json(force=True)
    members = body.get("members") or []

    if not members:
        return jsonify({"error": "No family members provided"}), 400
    if len(members) > 8:
        return jsonify({"error": "Maximum 8 family members supported"}), 400

    selected_model = body.get("selected_model", "meta-llama/llama-3-3-70b-instruct")
    language = body.get("preferred_language", "English")
    budget_friendly = body.get("budget_friendly", False)

    member_lines = "\n".join(
        f"- {m.get('name', f'Member {i+1}')}: "
        f"{m.get('age','')} yrs, {m.get('gender','')}, "
        f"{m.get('weight','?')} kg, {m.get('height','?')} cm, "
        f"goal: {m.get('goal','maintenance')}, "
        f"conditions: {m.get('conditions','none')}"
        for i, m in enumerate(members)
    )

    prompt = (
        f"Create a comprehensive family nutrition plan for:\n{member_lines}\n\n"
        f"Provide:\n"
        f"1. Individual daily calorie targets for each member\n"
        f"2. A unified 3-day Indian family meal plan (meals everyone can share)\n"
        f"3. Modifications for members with special dietary needs\n"
        f"4. A combined weekly shopping list\n"
        f"5. A Family Nutrition Score (0–100) with explanation\n"
        f"6. One easy family recipe that suits most members\n\n"
        f"Keep meals practical and focused on Indian cuisine."
    )

    try:
        reply = call_watsonx(
            prompt,
            history=[],
            model_id=selected_model,
            language=language,
            budget_friendly=budget_friendly
        )
        return jsonify({"family_plan": reply, "member_count": len(members), "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Family plan error: %s", exc)
        return jsonify({"error": "Failed to generate family plan"}), 500


@app.route("/api/analyze-food", methods=["POST"])
def analyze_food_route():
    body = request.get_json(force=True)
    food = (body.get("food_description") or "").strip()
    if not food:
        return jsonify({"error": "food_description is required"}), 400

    selected_model = body.get("selected_model", "meta-llama/llama-3-3-70b-instruct")
    language = body.get("preferred_language", "English")
    budget_friendly = body.get("budget_friendly", False)

    prompt = (
        f'Analyse the nutritional content of: "{food}"\n\n'
        f"Provide:\n"
        f"1. Estimated calories (kcal)\n"
        f"2. Macros — Protein (g), Carbohydrates (g), Fats (g), Fibre (g)\n"
        f"3. Notable micronutrients (vitamins / minerals)\n"
        f"4. Glycaemic Index category (Low / Medium / High)\n"
        f"5. Healthiness rating 1–10 with a brief reason\n"
        f"6. One practical suggestion to make it healthier\n\n"
        f"Assume a standard Indian serving size if quantities are not specified."
    )

    try:
        reply = call_watsonx(
            prompt,
            history=[],
            model_id=selected_model,
            language=language,
            budget_friendly=budget_friendly
        )
        return jsonify({"analysis": reply, "food": food, "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Food analysis error: %s", exc)
        return jsonify({"error": "Failed to analyse food"}), 500


@app.route("/api/generate-recipe", methods=["POST"])
def generate_recipe_api():
    body = request.get_json(force=True)
    ingredients = (body.get("ingredients") or "").strip()
    profile = body.get("profile") or {}
    
    if not ingredients:
        return jsonify({"error": "Ingredients are required"}), 400

    selected_model = profile.get("selected_model", "meta-llama/llama-3-3-70b-instruct")
    language = profile.get("preferred_language", "English")
    budget_friendly = profile.get("budget_friendly", False)

    prompt = (
        f"Generate a healthy, delicious, and personalized Indian recipe using the following ingredients from my pantry:\n"
        f"Ingredients: {ingredients}\n\n"
        f"User Details:\n"
        f"- Goal: {profile.get('goal', 'maintenance')}\n"
        f"- Diet Type: {profile.get('diet_type', 'balanced')}\n"
        f"- Health conditions: {profile.get('health_conditions', 'none')}\n"
        f"- Allergies: {profile.get('allergies', 'none')}\n\n"
        f"Provide the output in the following structure:\n"
        f"1. Recipe Name\n"
        f"2. Prep time & Cook time\n"
        f"3. Ingredients list with exact quantities\n"
        f"4. Step-by-step preparation steps\n"
        f"5. Nutritional breakdown (estimated calories, protein, carbs, fats)\n"
        f"6. Why this is good for the user's specific health goals."
    )

    try:
        reply = call_watsonx(
            prompt,
            history=[],
            profile=profile,
            model_id=selected_model,
            language=language,
            budget_friendly=budget_friendly
        )
        return jsonify({"recipe": reply, "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Recipe generation error: %s", exc)
        return jsonify({"error": "Failed to generate recipe"}), 500


# ============================================================
#  ENTRY POINT
# ============================================================
if __name__ == "__main__":
    ai_status = "READY" if _credentials_ok() else "OFFLINE (fallback mode)"
    logger.info("=" * 60)
    logger.info("  NutriAI Agent")
    logger.info("  URL      : http://127.0.0.1:%s", FLASK_PORT)
    logger.info("  Model    : %s", "meta-llama/llama-3-3-70b-instruct")
    logger.info("  Region   : %s", WATSONX_URL)
    logger.info("  AI status: %s", ai_status)
    logger.info("=" * 60)
    app.run(
        host="0.0.0.0",
        port=FLASK_PORT,
        debug=os.getenv("FLASK_DEBUG", "True").lower() == "true",
    )

