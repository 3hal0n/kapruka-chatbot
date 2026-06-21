import json
import os
from pathlib import Path

_DEFAULT_PATH = str(Path(__file__).resolve().parents[1] / "data" / "recipient_profiles.json")


class SemanticMemory:

    def __init__(self, filepath: str = _DEFAULT_PATH):
        self.filepath = filepath
        self.profiles = {}
        self.load()
    
    def load(self):
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        
        if os.path.exists(self.filepath):
            with open(self.filepath, "r") as f:
                content = f.read().strip()
            if content:  # ← only parse if file has content
                self.profiles = json.loads(content)
                print(f"Loaded {len(self.profiles)} recipient profiles.")
            else:
                self.profiles = {}
                print("Empty profiles file. Starting fresh.")

        else:
            self.profiles = {}
            print("No profiles found. Starting fresh.")

    def save(self):
        with open(self.filepath, "w") as f:
            json.dump(self.profiles, f, indent=2)
        print(f"Profiles saved to {self.filepath}")

    def add_or_update_profile(self, customer_id: str, name: str, allergies: list = [], preferences: list = [], location: str = ""):
        
        if customer_id not in self.profiles:
            self.profiles[customer_id] = {"allergies": {},
                "preferences": {},
                "location": {}
                }
        name = name.lower() 
        
        
        if allergies:
            if name not in self.profiles[customer_id]["allergies"]:
                self.profiles[customer_id]["allergies"][name] = []

            self.profiles[customer_id]["allergies"][name] = list(
                set(self.profiles[customer_id]["allergies"][name] + allergies)
            )
        if preferences:
            if name not in self.profiles[customer_id]["preferences"]:
                self.profiles[customer_id]["preferences"][name] = []
            self.profiles[customer_id]["preferences"][name] = list(
                set(self.profiles[customer_id]["preferences"][name]  + preferences)
            )
        if location:
            if name not in self.profiles[customer_id]["location"]:
                self.profiles[customer_id]["location"][name] = ""
            self.profiles[customer_id]["location"][name] = location
        
        self.save()
        print('preference update thread ends...')
        print(f"Profile updated: {name}")

    def get_profile(self, customer_id: str, name: str) -> dict:
        name = name.lower()
        customer = self.profiles.get(customer_id, {})
        
        return {
            "allergies": customer.get("allergies", {}).get(name, []),
            "preferences": customer.get("preferences", {}).get(name, []),
            "location": customer.get("location", {}).get(name, "")
        }



# Module-level singleton used by router.py
_memory = SemanticMemory()

def add_or_update_profile(customer_id: str, name: str, allergies: list = None, preferences: list = None, location: str = "") -> str:
    if not name:
        return "No recipient name provided — profile not updated."
    _memory.add_or_update_profile(
        customer_id=customer_id,
        name=name,
        allergies=allergies or [],
        preferences=[preferences] if isinstance(preferences, str) and preferences else (preferences or []),
        location=location or ""
    )
    display = "your" if name.lower() == "self" else f"{name}'s"
    return f"Got it — I've saved {display} preferences."

def get_profile(customer_id: str, name: str) -> dict:
    return _memory.get_profile(customer_id, name) or {}
