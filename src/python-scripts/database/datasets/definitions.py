from peewee import *
from .base import BaseModel
import datetime


class Tropical_bounds(BaseModel):
    north = DoubleField()
    south = DoubleField()


class Version(BaseModel):
    value = CharField()
    release_date = DateTimeField(default=datetime.datetime.now)


class File_cio_classification(BaseModel):
    name = CharField()


class File_cio(BaseModel):
    classification = ForeignKeyField(File_cio_classification, on_delete='CASCADE', related_name='files')
    order_in_class = IntegerField()
    database_table = CharField()
    default_file_name = CharField()
    is_core_file = BooleanField()


class Print_prt(BaseModel):
    nyskip = IntegerField()
    day_start = IntegerField()
    yrc_start = IntegerField()
    day_end = IntegerField()
    yrc_end = IntegerField()
    interval = IntegerField()
    csvout = BooleanField()
    dbout = BooleanField()
    cdfout = BooleanField()
    crop_yld = CharField(default='b')
    mgtout = BooleanField()
    hydcon = BooleanField()
    fdcout = BooleanField()


class Print_prt_object(BaseModel):
    name = CharField()
    daily = BooleanField()
    monthly = BooleanField()
    yearly = BooleanField()
    avann = BooleanField()
