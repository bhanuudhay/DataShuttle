from pymongo import MongoClient
from app.config.settings import MONGO_URI

client = MongoClient(MONGO_URI)
db = client.get_database()

users_collection = db["users"]

users_collection.create_index("email", unique=True)
