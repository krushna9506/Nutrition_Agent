# 🔮 Future Scope & Expansion Roadmap

This document outlines the planned roadmap for **NutriAI Agent** to expand its capabilities, improve community outreach, and scale its commercial potential.

---

## 1. ⌚ Wearable & Fitness Tracker Sync
- **Abstractions**: Connect via REST APIs to popular health aggregators like Apple HealthKit, Google Health Connect, Fitbit, and Garmin.
- **Benefits**:
  - **Dynamic Targets**: Automatically adjust daily calorie and hydration targets based on active energy expenditure (calories burned from steps/workouts).
  - **Sleep Tracking**: Sync sleep data to provide cortisol-reducing Ayurvedic nutritional advice.

---

## 2. 📸 Computer Vision Food Scanner
- **Technology**: Deploy a lightweight YOLOv8 or Watson-based custom image classification model.
- **Workflow**:
  - User takes a picture of their plate (e.g. plate of Roti + Dal + Bhindi).
  - The model segments the items, estimates volume/portion size, and logs estimated calories and macro split instantly.
- **Value**: Reduces logging friction, which is the primary cause of user churn in commercial diet apps.

---

## 3. 🎙️ Multilingual Voice Interface
- **Technology**: Integrate with **IBM Watson Speech-to-Text** and **Text-to-Speech**.
- **Use Case**:
  - A user speaks: *"मैंने आज सुबह दो इडली खाई" (I ate two idli this morning)*.
  - The voice assistant logs the meal automatically and replies with supportive wellness tips in the user's regional dialect.
- **Social Benefit**: Invaluable for elderly, visually impaired, or less tech-literate populations across rural India.

---

## 4. ⚖️ IoT Kitchen & Body Scales Integration
- **Integrations**: Sync with Bluetooth-enabled smart kitchen food scales and body composition scales.
- **Benefits**:
  - Lock in exact gram weights of raw food ingredients for highly accurate home baking/cooking nutrition calculation.
  - Sync body fat percentage, skeletal muscle mass, and visceral fat trends directly into the user's Weight Logger.

---

## 5. 🏪 Geo-Location Healthy Dining Engine
- **Technology**: Map-based search integration (e.g. Google Maps/OpenStreetMap API).
- **Workflow**:
  - User is dining out and needs something under 500 kcal that fits a diabetic diet.
  - The app scans restaurant menus nearby and highlights specific dishes (e.g., *"Tandoori Paneer Tikka at Restaurant X"* or *"Steamed Idli at Café Y"*) that align with their nutritional target.

---

## 6. 💼 Commercialization & Business Model
- **Freemium Tier**: Local tracking, basic BMI advice, and 3-day meal plans remain free.
- **Premium Subscription**: 7-day multi-model plans, ingredient pantry recipe generator, and family sync with print-ready reports.
- **B2B Integration**: Partner with corporate wellness portals to offer employees personalized nutrition dashboards, reducing healthcare premium costs for companies.
