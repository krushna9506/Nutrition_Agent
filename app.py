# ============================================================
#  NutriAI Agent — Flask Backend with IBM Watsonx.ai
# ============================================================
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
MAX_TOKENS         = int(os.getenv("MAX_TOKENS",  1024))
TEMPERATURE        = float(os.getenv("TEMPERATURE", 0.7))

# Model served in the au-syd region that supports chat completions
WATSONX_MODEL_ID   = "meta-llama/llama-3-3-70b-instruct"

# ============================================================
#  FLASK APP
# ============================================================
app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
CORS(app)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ============================================================
#  WATSONX.AI — singleton model client
# ============================================================
_model: ModelInference | None = None

def _is_placeholder(val: str) -> bool:
    v = (val or "").strip()
    return not v or v.startswith("your_")


def _credentials_ok() -> bool:
    return not _is_placeholder(IBM_CLOUD_API_KEY) and not _is_placeholder(WATSONX_PROJECT_ID)


def get_model() -> ModelInference | None:
    """
    Lazy-initialize and return the Watsonx.ai ModelInference client.
    Returns None when credentials are missing so callers fall back
    to the offline helpers.
    """
    global _model
    if _model is not None:
        return _model

    if not _credentials_ok():
        logger.warning(
            "Watsonx.ai credentials not configured — running in offline fallback mode. "
            "Set IBM_CLOUD_API_KEY and WATSONX_PROJECT_ID in .env to enable AI responses."
        )
        return None

    try:
        credentials = Credentials(url=WATSONX_URL, api_key=IBM_CLOUD_API_KEY)
        client      = APIClient(credentials=credentials, project_id=WATSONX_PROJECT_ID)

        # Chat-completion parameters — the chat() API uses "max_tokens", not "max_new_tokens"
        chat_params = {
            "max_tokens":       MAX_TOKENS,
            GenParams.TEMPERATURE:       TEMPERATURE,
            GenParams.TOP_P:             0.9,
            GenParams.REPETITION_PENALTY: 1.05,
        }

        _model = ModelInference(
            model_id=WATSONX_MODEL_ID,
            api_client=client,
            project_id=WATSONX_PROJECT_ID,
            params=chat_params,
        )
        logger.info("Watsonx.ai model ready: %s @ %s", WATSONX_MODEL_ID, WATSONX_URL)
        return _model

    except Exception as exc:
        logger.error("Watsonx.ai init failed: %s", exc)
        return None


# ============================================================
#  WATSONX.AI — chat helper
# ============================================================
SYSTEM_PROMPT = get_system_prompt()


def _build_messages(
    user_message: str,
    history: list[dict],
    profile: dict | None = None,
) -> list[dict]:
    """
    Build the messages list for ModelInference.chat().

    Format (OpenAI-compatible, accepted by Watsonx.ai chat API):
        [
            {"role": "system",    "content": "..."},
            {"role": "user",      "content": "..."},
            {"role": "assistant", "content": "..."},
            ...
            {"role": "user",      "content": "<current message>"},
        ]
    """
    system_content = SYSTEM_PROMPT

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
) -> str:
    """
    Call the Watsonx.ai chat API and return the assistant reply string.
    Falls back to offline helpers on any error or missing credentials.
    """
    model = get_model()
    if model is None:
        return _offline_chat(user_message)

    messages = _build_messages(user_message, history or [], profile)

    try:
        result = model.chat(messages=messages)
        # Watsonx chat API returns:
        #   result["choices"][0]["message"]["content"]
        reply = (
            result
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        if not reply:
            raise ValueError("Empty response from Watsonx.ai")
        logger.info("Watsonx.ai chat OK (%d chars)", len(reply))
        return reply

    except Exception as exc:
        logger.error("Watsonx.ai chat error: %s", exc)
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
    return jsonify({
        "status":      "ok",
        "app":         "NutriAI Agent",
        "version":     "1.0.0",
        "ai_backend":  "watsonx.ai",
        "model":       WATSONX_MODEL_ID,
        "region":      WATSONX_URL,
        "ai_ready":    ai_ready,
        "timestamp":   datetime.utcnow().isoformat(),
    })


# ============================================================
#  ROUTES — API
# ============================================================

@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Conversational endpoint.
    Body: { "message": str, "history": list[dict], "profile": dict }
    """
    body    = request.get_json(force=True)
    message = (body.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > 2000:
        return jsonify({"error": "message too long (max 2000 chars)"}), 400

    history = body.get("history") or []
    profile = body.get("profile") or {}

    try:
        reply = call_watsonx(message, history=history, profile=profile)
        return jsonify({"response": reply, "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Chat route error: %s", exc)
        return jsonify({"error": "Failed to generate response. Please try again."}), 500


@app.route("/api/bmi", methods=["POST"])
def bmi_route():
    """
    Body: { "weight_kg": float, "height_cm": float }
    """
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
    """
    Body: { "weight_kg", "height_cm", "age", "gender", "activity", "goal" }
    """
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
    """
    Body: { "profile": dict, "days": int, "preferences": str }
    Uses Watsonx.ai chat API for a personalised Indian meal plan.
    """
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
        reply = call_watsonx(prompt, history=[], profile=profile)
        return jsonify({"meal_plan": reply, "days": days, "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Meal plan error: %s", exc)
        return jsonify({"error": "Failed to generate meal plan"}), 500


@app.route("/api/family-plan", methods=["POST"])
def family_plan_route():
    """
    Body: { "members": list[dict] }
    Each member: { name, age, gender, weight, height, goal, conditions }
    """
    body    = request.get_json(force=True)
    members = body.get("members") or []

    if not members:
        return jsonify({"error": "No family members provided"}), 400
    if len(members) > 8:
        return jsonify({"error": "Maximum 8 family members supported"}), 400

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
        reply = call_watsonx(prompt, history=[])
        return jsonify({"family_plan": reply, "member_count": len(members), "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Family plan error: %s", exc)
        return jsonify({"error": "Failed to generate family plan"}), 500


@app.route("/api/analyze-food", methods=["POST"])
def analyze_food_route():
    """
    Body: { "food_description": str }
    Returns nutritional analysis via Watsonx.ai.
    """
    body = request.get_json(force=True)
    food = (body.get("food_description") or "").strip()
    if not food:
        return jsonify({"error": "food_description is required"}), 400

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
        reply = call_watsonx(prompt, history=[])
        return jsonify({"analysis": reply, "food": food, "timestamp": datetime.utcnow().isoformat()})
    except Exception as exc:
        logger.error("Food analysis error: %s", exc)
        return jsonify({"error": "Failed to analyse food"}), 500


# ============================================================
#  ENTRY POINT
# ============================================================
if __name__ == "__main__":
    ai_status = "READY" if _credentials_ok() else "OFFLINE (fallback mode)"
    logger.info("=" * 60)
    logger.info("  NutriAI Agent")
    logger.info("  URL      : http://127.0.0.1:%s", FLASK_PORT)
    logger.info("  Model    : %s", WATSONX_MODEL_ID)
    logger.info("  Region   : %s", WATSONX_URL)
    logger.info("  AI status: %s", ai_status)
    logger.info("=" * 60)
    app.run(
        host="0.0.0.0",
        port=FLASK_PORT,
        debug=os.getenv("FLASK_DEBUG", "True").lower() == "true",
    )
