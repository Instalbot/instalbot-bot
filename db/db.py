from os import getenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

url_object = URL.create(
    drivername="postgresql+psycopg",
    username=getenv("DATABASE_USERNAME"),
    password=getenv("DATABASE_PASSWORD"),
    host=getenv("DATABASE_HOST"),
    database=getenv("DATABASE_NAME"),
)

engine = create_engine(url_object, echo=True)

from . import models