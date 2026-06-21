"""

short term memory class 

add message method to store memory

get history method to retrieve history

clear history method to delete history

"""

from datetime import datetime
from utils.config import ST_MEMORY_MAX_TURNS

class ShortTermMemory:
    def __init__ (self, max_turns : int = ST_MEMORY_MAX_TURNS):

        self.max_turns = max_turns
        self.history : list[dict] = []
        self.session_start = datetime.now().isoformat()


    def add_message(self,role:str,content:str):


        self.history.append({
            'role' : role,
            'content' : content,
            'timestamp' : datetime.now().isoformat() 
        })


        #dropping older convos
        if len(self.history) > self.max_turns * 2 :
            self.history = self.history[2:]


    


    def get_history(self):
        return [
            {'role' : msg['role'],'content' : msg['content'] } for msg in self.history
        ]


    def reset_history(self):
        self.history = []
        self.session_start = datetime.now().isoformat()
        print('Session reset.Memory cleared')
        
"""


# ── Quick test 
if __name__ == "__main__":
    st_memory = ShortTermMemory(max_turns=5)
 
    # Simulate a conversation
    st_memory.add_message("user", "I need a cake for my wife's birthday this Sunday.")
    st_memory.add_message("assistant", "I'd love to help! Does she have any allergies?")
    st_memory.add_message("user", "Yes, she's allergic to nuts.")
    st_memory.add_message("assistant", "Got it — I'll only recommend nut-free options.")
 
    print("=== Full History (for LLM) ===")
    for msg in st_memory.get_history():
        print(f"  [{msg['role']}]: {msg['content']}")

    print("=== History clearring ... ===")
    st_memory.reset_history()

    
    print("=== Full History (for LLM) ===")
    for msg in st_memory.get_history():
        print(f"  [{msg['role']}]: {msg['content']}")"""

    
