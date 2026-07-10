import json
import os
import unittest
from datetime import datetime
from app import app, db, UserProfileModel, FamilyMemberModel, ChatMessageModel, WeightLogModel

class TestNutritionAgentAPI(unittest.TestCase):
    def setUp(self):
        # Configure app for testing
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"  # In-memory test DB
        app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        
        self.client = app.test_client()
        
        # Initialize database
        with app.app_context():
            db.create_all()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def test_health_check(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["database"], "connected")
        self.assertEqual(data["app"], "NutriAI Agent")

    def test_bmi_calculation(self):
        res = self.client.post("/api/bmi", json={"weight_kg": 70, "height_cm": 170})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["bmi"], 24.2)
        self.assertEqual(data["category"], "Normal Weight")

    def test_calories_calculation(self):
        res = self.client.post("/api/calories", json={
            "weight_kg": 70, "height_cm": 170, "age": 30,
            "gender": "male", "activity": "moderate", "goal": "maintain"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("target_calories", data)
        self.assertIn("protein_g", data)

    def test_profile_sync(self):
        # Test GET empty profile
        res_get = self.client.get("/api/profile")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.get_json(), {})

        # Test POST profile
        payload = {
            "name": "Arjun",
            "age": 28,
            "gender": "male",
            "weight": 75.5,
            "height": 178,
            "goal": "muscle building",
            "diet_type": "vegetarian",
            "health_conditions": "none",
            "allergies": "peanut",
            "activity": "active",
            "budget_friendly": True,
            "preferred_language": "Hindi",
            "selected_model": "ibm/granite-3-8b-instruct"
        }
        res_post = self.client.post("/api/profile", json=payload)
        self.assertEqual(res_post.status_code, 200)
        self.assertEqual(res_post.get_json()["status"], "success")

        # Test GET saved profile
        res_get2 = self.client.get("/api/profile")
        self.assertEqual(res_get2.status_code, 200)
        data = res_get2.get_json()
        self.assertEqual(data["name"], "Arjun")
        self.assertEqual(data["budget_friendly"], True)
        self.assertEqual(data["preferred_language"], "Hindi")
        self.assertEqual(data["selected_model"], "ibm/granite-3-8b-instruct")

    def test_family_members(self):
        # Add family member
        payload = {
            "name": "Priya",
            "relation": "Spouse",
            "age": 26,
            "gender": "female",
            "weight": 60,
            "height": 160,
            "goal": "maintenance",
            "activity": "moderate",
            "conditions": "lactose intolerant"
        }
        res_post = self.client.post("/api/family-members", json=payload)
        self.assertEqual(res_post.status_code, 200)
        member_id = res_post.get_json()["id"]

        # Fetch family members
        res_get = self.client.get("/api/family-members")
        self.assertEqual(res_get.status_code, 200)
        members = res_get.get_json()
        self.assertEqual(len(members), 1)
        self.assertEqual(members[0]["name"], "Priya")
        self.assertEqual(members[0]["relation"], "Spouse")

        # Delete family member
        res_del = self.client.delete(f"/api/family-members/{member_id}")
        self.assertEqual(res_del.status_code, 200)

        # Confirm empty list
        res_get_empty = self.client.get("/api/family-members")
        self.assertEqual(len(res_get_empty.get_json()), 0)

    def test_weight_logs(self):
        # Create log
        res_post = self.client.post("/api/weight-logs", json={"weight": 70, "height": 170})
        self.assertEqual(res_post.status_code, 200)
        log_id = res_post.get_json()["log"]["id"]

        # Get logs
        res_get = self.client.get("/api/weight-logs")
        self.assertEqual(res_get.status_code, 200)
        logs = res_get.get_json()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["weight"], 70)
        self.assertEqual(logs[0]["bmi"], 24.2)

if __name__ == "__main__":
    unittest.main()
