from openpyxl import Workbook
from datetime import date
import random
import os

out_path = r"G:\\codex_projects\\colegios\\plantillas\\ejemplos\\ejemplo_10_registros.xlsx"

headers = [
    "institucion",
    "fecha",
    "persona1_nombre",
    "persona1_apellido",
    "persona1_cedula",
    "persona1_email",
    "persona1_celular",
    "persona2_nombre",
    "persona2_apellido",
    "persona2_cedula",
    "persona2_email",
    "persona2_celular",
]

nombres = ["Ana", "Luis", "Maria", "Carlos", "Sofia", "Jorge", "Paula", "Diego", "Lucia", "Mateo"]
apellidos = ["Perez", "Gomez", "Lopez", "Torres", "Ruiz", "Moreno", "Castro", "Vega", "Silva", "Rojas"]

wb = Workbook()
ws = wb.active
ws.title = "registros"
ws.append(headers)

for i in range(10):
    n1 = nombres[i % len(nombres)]
    a1 = apellidos[i % len(apellidos)]
    n2 = nombres[(i + 3) % len(nombres)]
    a2 = apellidos[(i + 5) % len(apellidos)]
    ced1 = f"17{random.randint(10000000, 99999999)}"
    ced2 = f"09{random.randint(10000000, 99999999)}"
    email1 = f"{n1.lower()}.{a1.lower()}@correo.com"
    email2 = f"{n2.lower()}.{a2.lower()}@correo.com"
    cel1 = f"09{random.randint(10000000, 99999999)}"
    cel2 = f"09{random.randint(10000000, 99999999)}"
    ws.append([
        "Colegio Central",
        date.today().isoformat(),
        n1,
        a1,
        ced1,
        email1,
        cel1,
        n2,
        a2,
        ced2,
        email2,
        cel2,
    ])

os.makedirs(os.path.dirname(out_path), exist_ok=True)
wb.save(out_path)
print(out_path)
