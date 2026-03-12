# Plan MVP - Plataforma de Firmas para Colegios

## 1. Objetivo del MVP
Validar el flujo crítico end-to-end:
- Carga masiva (Excel).
- Envío a API de firma.
- Almacenamiento del PDF firmado.
- Panel básico de seguimiento por estado.

## 2. Alcance funcional
1. Multi-tenant básico (super admin + admins por institución).
2. Plantillas por institución con coordenadas X/Y y página.
3. Carga Excel con validación y saneo de datos.
4. Cola de envío con rate limit y reintentos.
5. Consulta de estado y descarga de PDF firmado.
6. Panel simple con filtros por estado.
7. Créditos simples por institución.

## 3. Arquitectura mínima
1. Backend: Node.js + TypeScript.
2. DB: PostgreSQL.
3. Cola: Redis + worker.
4. Storage: filesystem estructurado por institución.
5. Deploy: Docker Compose compatible con Coolify/Traefik.

## 4. Modelo de datos mínimo (tablas clave)
1. `organizations` (id, name, status, createdAt)
2. `users` (id, org_id nullable, role, email, password_hash, must_change_password)
3. `templates` (id, org_id, type, pdf_path, sign_x, sign_y, sign_page)
4. `requests` (id, org_id, omni_id, status, template_id, createdAt)
5. `signatories` (id, request_id, id_number, full_name, phone, email, sanitized_phone)
6. `request_events` (id, request_id, status, createdAt, meta_json)
7. `org_credits` (org_id, balance)

## 5. Flujo operativo
1. Admin colegio sube Excel + selecciona plantilla.
2. Backend valida filas y sanea celulares.
3. Inserta solicitudes `PENDING` + firmantes.
4. Worker procesa cola con rate limit.
5. API de firma: create ? document ? signatory ? send.
6. Job de polling consulta estado.
7. Si firmado: descarga PDF y lo guarda.
8. Panel muestra estado y enlaces.

## 6. Anti-spam y resiliencia
1. Rate limit por institución (ej. 10/min).
2. Reintentos automáticos 3 veces con backoff.
3. Circuito simple: si hay fallos masivos, pausar cola de esa institución.
4. Logs por request_id y omni_id.

## 7. Seguridad MVP
1. Contraseña inicial super admin = `000000` con cambio obligatorio.
2. Hash bcrypt.
3. `organization_id` en todas las consultas del admin.
4. Validación estricta de Excel.

## 8. DevOps y Docker
1. Servicios: `api`, `worker`, `postgres`, `redis`.
2. Healthchecks HTTP: `/health` en `api` y `worker`.
3. Script bash: verifica status 200 en cada servicio.

## 9. Entregables MVP
1. API REST mínima documentada.
2. Docker compose listo para Coolify.
3. UI simple: login, lista de solicitudes, filtros, estados.
4. Carga Excel con preview de errores.
5. Worker y cola funcionando.

## 10. Fases y tiempos (referencial)
1. Semana 1: DB + API base + auth.
2. Semana 2: carga Excel + cola + integración OmniSwitch.
3. Semana 3: polling + storage + panel básico.
4. Semana 4: hardening + deploy en Coolify.

## 11. No hacer en MVP
1. Editor visual de coordenadas.
2. Reportes avanzados.
3. Auditoría con versionado completo.
4. Multi-canal de notificaciones más allá de WhatsApp.
