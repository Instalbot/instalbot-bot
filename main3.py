from datetime import datetime
from random import randint
from dotenv import load_dotenv
from sqlalchemy import text
import pytz
import threading

load_dotenv()

from db import db, models

botQueue = dict([])

def refresh_queue():
    with db.Session() as session:
        # Retrieve all flags that are in range of flag's hoursrange
        result = session.query(models.Flag).filter(
            text("numeric_add(EXTRACT(HOUR FROM now()), EXTRACT(MINUTE FROM now()) / 60) <@ hoursrange")
        ).all()
        
        # Insert flags to botQueue
        keys = botQueue.keys()

        for flag in result:
            # Generate random time for flag and push it to queue
            if str(flag.userid) not in keys:
                now = datetime.now(pytz.timezone('Europe/Warsaw'))
                timestamp = round(now.timestamp()) - now.minute * 60
                czas = randint(timestamp, timestamp + (int(flag.hoursrange.upper) - now.hour) * 3600)
                botQueue[str(flag.userid)] = [flag, czas]
            else:
                pass

print(botQueue)

def schedule_refresh():
    threading.Timer(3600, schedule_refresh).start()
    refresh_queue()

schedule_refresh()

print(botQueue)
