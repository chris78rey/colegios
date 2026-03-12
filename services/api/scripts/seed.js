import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function getOrCreateOrganization(name, status = "active") {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.organization.create({ data: { name, status } });
}

async function getOrCreateUser({
  email,
  role,
  organizationId,
  passwordHash = "ABC123#",
  mustChangePassword = true,
}) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email, role, organizationId, passwordHash, mustChangePassword },
  });
}

async function getOrCreateTemplate({
  organizationId,
  name,
  type,
  pdfPath,
  signX,
  signY,
  signPage,
  placeholders = [],
  requiredColumns = [],
  status = "active",
}) {
  const existing = await prisma.template.findFirst({ where: { organizationId, type } });
  if (existing) return existing;
  return prisma.template.create({
    data: {
      organizationId,
      name,
      type,
      pdfPath,
      signX,
      signY,
      signPage,
      placeholders,
      requiredColumns,
      status,
    },
  });
}

async function ensureCredits(organizationId, balance) {
  return prisma.orgCredit.upsert({
    where: { organizationId },
    update: { balance },
    create: { organizationId, balance },
  });
}

async function seedRequests({ organizationId, templateId }) {
  const existing = await prisma.request.count({ where: { organizationId } });
  if (existing > 0) return;

  const req1 = await prisma.request.create({
    data: {
      organizationId,
      templateId,
      status: "PENDING",
    },
  });

  const req2 = await prisma.request.create({
    data: {
      organizationId,
      templateId,
      status: "SENT",
      omniId: "OMNI-TEST-001",
    },
  });

  await prisma.signatory.createMany({
    data: [
      {
        requestId: req1.id,
        idNumber: "1723456789",
        fullName: "Ana Lucia Torres",
        phone: "0991234567",
        email: "ana.torres@example.com",
        sanitizedPhone: "0991234567",
        role: "REPRESENTANTE_PRINCIPAL",
        isPrimary: true,
      },
      {
        requestId: req2.id,
        idNumber: "1109876543",
        fullName: "David Castro",
        phone: "0971234567",
        email: "david.castro@example.com",
        sanitizedPhone: "0971234567",
        role: "REPRESENTANTE_PRINCIPAL",
        isPrimary: true,
      },
    ],
  });

  await prisma.requestEvent.createMany({
    data: [
      {
        requestId: req1.id,
        status: "PENDING",
        metaJson: { source: "seed" },
      },
      {
        requestId: req2.id,
        status: "SENT",
        metaJson: { source: "seed", omniId: "OMNI-TEST-001" },
      },
    ],
  });
}

async function main() {
  const orgA = await getOrCreateOrganization("Colegio Central");
  const orgB = await getOrCreateOrganization("Instituto Andino");

  await getOrCreateUser({
    email: "superadmin@firmaeducativa.com",
    role: "SUPER_ADMIN",
    organizationId: null,
    passwordHash: "ABC123#",
    mustChangePassword: true,
  });

  await getOrCreateUser({
    email: "admin@colegiocentral.edu",
    role: "ADMIN",
    organizationId: orgA.id,
    passwordHash: "ABC123#",
    mustChangePassword: true,
  });

  await getOrCreateUser({
    email: "admin@institutoandino.edu",
    role: "ADMIN",
    organizationId: orgB.id,
    passwordHash: "ABC123#",
    mustChangePassword: true,
  });

  const templateA = await getOrCreateTemplate({
    organizationId: orgA.id,
    name: "Solicitud Matricula 2024",
    type: "matricula-2024",
    pdfPath: "/data/storage/templates/matricula-2024.pdf",
    signX: 420,
    signY: 690,
    signPage: 1,
    placeholders: [
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
    ],
    requiredColumns: [
      "Cedula",
      "PrimerNombre",
      "SegunNombre",
      "PrimerApellido",
      "SegApellido",
      "Celular",
      "Email",
      "Direccion",
      "AlumnoNombre",
      "AlumnoApellido",
      "Curso",
      "Fecha",
      "Institucion",
    ],
    status: "active",
  });

  const templateB = await getOrCreateTemplate({
    organizationId: orgB.id,
    name: "Acta de Calificaciones",
    type: "acta-calificaciones",
    pdfPath: "/data/storage/templates/acta-calificaciones.pdf",
    signX: 400,
    signY: 680,
    signPage: 1,
    placeholders: [
      "nombre_estudiante",
      "representante",
      "correo",
      "celular",
      "institucion",
    ],
    requiredColumns: ["Nombre", "Representante", "Correo", "Celular"],
    status: "active",
  });

  await ensureCredits(orgA.id, 1500);
  await ensureCredits(orgB.id, 800);

  await seedRequests({ organizationId: orgA.id, templateId: templateA.id });
  await seedRequests({ organizationId: orgB.id, templateId: templateB.id });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
