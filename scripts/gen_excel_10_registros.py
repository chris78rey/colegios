from openpyxl import Workbook
from datetime import date
import random
import os

out_path = r"G:\\codex_projects\\colegios\\plantillas\\ejemplos\\ejemplo_10_registros.xlsx"

headers = [
    "Cedula",
    "PrimerNombre",
    "SegunNombre",
    "PrimerApellido",
    "SegApellido",
    "Celular",
    "Email",
    "FirmaPrincipal",
    "IdPais",
    "IdProvincia",
    "IdCiudad",
    "Direccion",
    "AlumnoNombre",
    "AlumnoApellido",
    "Curso",
    "Fecha",
    "Institucion",
]

nombres = ["Ana", "Luis", "Maria", "Carlos", "Sofia", "Jorge", "Paula", "Diego", "Lucia", "Mateo"]
apellidos = ["Perez", "Gomez", "Lopez", "Torres", "Ruiz", "Moreno", "Castro", "Vega", "Silva", "Rojas"]

wb = Workbook()
ws = wb.active
ws.title = "registros"
ws.append(headers)

for i in range(10):
    alumno_nombre = nombres[i % len(nombres)]
    alumno_apellido = apellidos[i % len(apellidos)]
    primer_nombre = nombres[(i + 3) % len(nombres)]
    segun_nombre = nombres[(i + 4) % len(nombres)]
    primer_apellido = apellidos[(i + 5) % len(apellidos)]
    seg_apellido = apellidos[(i + 6) % len(apellidos)]
    cedula = f"09{random.randint(10000000, 99999999)}"
    email = f"{primer_nombre.lower()}.{primer_apellido.lower()}@correo.com"
    celular = f"09{random.randint(10000000, 99999999)}"
    curso = f"{(i % 6) + 1}A"
    ws.append([
        cedula,
        primer_nombre,
        segun_nombre,
        primer_apellido,
        seg_apellido,
        celular,
        email,
        1,
        19,
        17,
        1701,
        "Quito",
        alumno_nombre,
        alumno_apellido,
        curso,
        date.today().isoformat(),
        "Colegio Central",
    ])

os.makedirs(os.path.dirname(out_path), exist_ok=True)
wb.save(out_path)
print(out_path)
