from dotenv import load_dotenv

load_dotenv()

from db import db

db.engine.connect()