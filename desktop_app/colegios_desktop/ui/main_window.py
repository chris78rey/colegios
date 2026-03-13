from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QApplication,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QPlainTextEdit,
    QProgressBar,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ..api_client import ApiSession, login_to_api, open_web_history_from_desktop, upload_batch_to_api
from ..batch_builder import build_batch_plan, export_batch_plan
from ..excel_utils import load_workbook_data
from ..models import BatchPlan, TemplateSpec, WorkbookData
from ..pdf_generator import generate_batch_pdfs
from ..template_utils import load_template_specs


class MainWindow(QMainWindow):
    def __init__(self, output_root: Path) -> None:
        super().__init__()
        self.output_root = output_root
        self.output_root.mkdir(parents=True, exist_ok=True)

        self.templates: list[TemplateSpec] = []
        self.workbook: WorkbookData | None = None
        self.batch_plan: BatchPlan | None = None
        self.api_session: ApiSession | None = None
        self.last_output_path: Path | None = None
        self.last_uploaded_batch_id: str = ""

        self.setWindowTitle("Generador de documentos")
        self.resize(1320, 840)

        root = QWidget()
        root.setStyleSheet(
            """
            QWidget { background: #f4f1ea; color: #1f2937; }
            QFrame[card="true"] {
              background: #fffdf8;
              border: 1px solid #e8dfd0;
              border-radius: 18px;
            }
            QPushButton[primary="true"] {
              background: #184e3b;
              color: white;
              border: 0;
              border-radius: 14px;
              padding: 14px 18px;
              font-weight: 700;
            }
            QPushButton[primary="true"]:disabled {
              background: #9ca3af;
              color: #f9fafb;
            }
            QPushButton[secondary="true"] {
              background: white;
              color: #184e3b;
              border: 1px solid #cfd8cc;
              border-radius: 12px;
              padding: 10px 14px;
              font-weight: 600;
            }
            QPlainTextEdit {
              background: #fffdf8;
              border: 1px solid #e8dfd0;
              border-radius: 14px;
              padding: 10px;
            }
            QTableWidget {
              background: white;
              border: 1px solid #e8dfd0;
              border-radius: 14px;
              gridline-color: #eee7db;
            }
            """
        )

        main_layout = QVBoxLayout(root)
        main_layout.setContentsMargins(24, 20, 24, 20)
        main_layout.setSpacing(16)

        header = QVBoxLayout()
        title = QLabel("Generador local de documentos")
        title_font = QFont()
        title_font.setPointSize(20)
        title_font.setBold(True)
        title.setFont(title_font)
        header.addWidget(title)

        subtitle = QLabel(
            "Carga tus plantillas, selecciona el Excel y genera todos los PDF sin depender del navegador."
        )
        subtitle.setWordWrap(True)
        subtitle.setStyleSheet("color: #5b6472;")
        header.addWidget(subtitle)
        main_layout.addLayout(header)

        steps_layout = QGridLayout()
        steps_layout.setHorizontalSpacing(14)
        steps_layout.setVerticalSpacing(14)

        self.templates_card, self.templates_value = self._build_step_card(
            "1. Plantillas",
            "Selecciona hasta 4 plantillas. Por ahora la generacion de PDF funciona con HTML.",
            "No has cargado plantillas.",
            "Seleccionar plantillas",
            self.select_templates,
        )
        steps_layout.addWidget(self.templates_card, 0, 0)

        self.excel_card, self.excel_value = self._build_step_card(
            "2. Excel",
            "Carga el archivo con los registros. La app revisa las columnas automaticamente.",
            "No has cargado Excel.",
            "Seleccionar Excel",
            self.select_excel,
        )
        steps_layout.addWidget(self.excel_card, 0, 1)

        self.generate_card, self.generate_value = self._build_step_card(
            "3. Generar",
            "Cuando todo este listo, la app crea los PDF y los guarda en una carpeta de salida.",
            "Aun no hay documentos generados.",
            "Generar documentos",
            self.generate_pdfs,
            primary=True,
        )
        steps_layout.addWidget(self.generate_card, 0, 2)

        main_layout.addLayout(steps_layout)

        status_card = QFrame()
        status_card.setProperty("card", True)
        status_layout = QVBoxLayout(status_card)
        status_layout.setContentsMargins(18, 18, 18, 18)
        status_layout.setSpacing(10)

        self.status_label = QLabel("Estado: esperando archivos.")
        self.status_label.setStyleSheet("font-weight: 700;")
        status_layout.addWidget(self.status_label)

        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setValue(0)
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(12)
        status_layout.addWidget(self.progress)

        self.hint_label = QLabel(
            "Sugerencia: usa plantillas HTML si quieres una app facil de distribuir sin instalar LibreOffice."
        )
        self.hint_label.setWordWrap(True)
        self.hint_label.setStyleSheet("color: #5b6472;")
        status_layout.addWidget(self.hint_label)
        main_layout.addWidget(status_card)

        connection_card = QFrame()
        connection_card.setProperty("card", True)
        connection_layout = QVBoxLayout(connection_card)
        connection_layout.setContentsMargins(18, 18, 18, 18)
        connection_layout.setSpacing(10)

        connection_title = QLabel("Sistema web")
        connection_title.setStyleSheet("font-weight: 700; font-size: 15px;")
        connection_layout.addWidget(connection_title)

        connection_hint = QLabel(
            "Conecta la app al sistema web para subir los documentos ya generados."
        )
        connection_hint.setWordWrap(True)
        connection_hint.setStyleSheet("color: #5b6472;")
        connection_layout.addWidget(connection_hint)

        connection_form = QGridLayout()
        connection_form.setHorizontalSpacing(10)
        connection_form.setVerticalSpacing(10)

        self.api_base_input = QLineEdit("http://localhost:8080")
        self.api_email_input = QLineEdit()
        self.api_password_input = QLineEdit()
        self.api_password_input.setEchoMode(QLineEdit.Password)

        connection_form.addWidget(QLabel("Direccion del sistema"), 0, 0)
        connection_form.addWidget(self.api_base_input, 0, 1)
        connection_form.addWidget(QLabel("Correo"), 1, 0)
        connection_form.addWidget(self.api_email_input, 1, 1)
        connection_form.addWidget(QLabel("Contrasena"), 2, 0)
        connection_form.addWidget(self.api_password_input, 2, 1)
        connection_layout.addLayout(connection_form)

        connection_actions = QHBoxLayout()
        self.login_btn = QPushButton("Conectar")
        self.login_btn.setProperty("secondary", True)
        self.login_btn.clicked.connect(self.login_to_system)
        connection_actions.addWidget(self.login_btn)

        self.upload_btn = QPushButton("Subir documentos al sistema")
        self.upload_btn.setProperty("secondary", True)
        self.upload_btn.clicked.connect(self.upload_to_system)
        connection_actions.addWidget(self.upload_btn)

        self.open_web_btn = QPushButton("Abrir historial web")
        self.open_web_btn.setProperty("secondary", True)
        self.open_web_btn.clicked.connect(self.open_web_history)
        connection_actions.addWidget(self.open_web_btn)
        connection_actions.addStretch(1)
        connection_layout.addLayout(connection_actions)

        self.connection_status = QLabel("No conectado.")
        self.connection_status.setStyleSheet("font-weight: 600; color: #5b6472;")
        connection_layout.addWidget(self.connection_status)

        main_layout.addWidget(connection_card)

        middle_layout = QHBoxLayout()
        middle_layout.setSpacing(16)

        left_card = QFrame()
        left_card.setProperty("card", True)
        left_layout = QVBoxLayout(left_card)
        left_layout.setContentsMargins(18, 18, 18, 18)
        left_layout.setSpacing(10)

        left_title = QLabel("Resumen")
        left_title.setStyleSheet("font-weight: 700; font-size: 15px;")
        left_layout.addWidget(left_title)

        self.summary_box = QPlainTextEdit()
        self.summary_box.setReadOnly(True)
        self.summary_box.setPlaceholderText("Aqui veras un resumen simple del proceso.")
        left_layout.addWidget(self.summary_box)
        middle_layout.addWidget(left_card, 1)

        right_card = QFrame()
        right_card.setProperty("card", True)
        right_layout = QVBoxLayout(right_card)
        right_layout.setContentsMargins(18, 18, 18, 18)
        right_layout.setSpacing(10)

        right_title = QLabel("Registros del Excel")
        right_title.setStyleSheet("font-weight: 700; font-size: 15px;")
        right_layout.addWidget(right_title)

        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        right_layout.addWidget(self.table)
        middle_layout.addWidget(right_card, 2)

        main_layout.addLayout(middle_layout)

        footer_actions = QHBoxLayout()
        footer_actions.addStretch(1)

        self.export_btn = QPushButton("Guardar estructura del lote")
        self.export_btn.setProperty("secondary", True)
        self.export_btn.clicked.connect(self.export_manifest)
        footer_actions.addWidget(self.export_btn)

        self.open_output_btn = QPushButton("Ver carpeta de salida")
        self.open_output_btn.setProperty("secondary", True)
        self.open_output_btn.clicked.connect(self.show_output_folder)
        footer_actions.addWidget(self.open_output_btn)

        self.copy_output_btn = QPushButton("Copiar ruta de salida")
        self.copy_output_btn.setProperty("secondary", True)
        self.copy_output_btn.clicked.connect(self.copy_output_path)
        footer_actions.addWidget(self.copy_output_btn)

        main_layout.addLayout(footer_actions)

        self.setCentralWidget(root)
        self.refresh_ui()

    def _build_step_card(
        self,
        title: str,
        description: str,
        initial_value: str,
        button_text: str,
        callback,
        primary: bool = False,
    ) -> tuple[QFrame, QLabel]:
        card = QFrame()
        card.setProperty("card", True)
        layout = QVBoxLayout(card)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(10)

        title_label = QLabel(title)
        title_label.setStyleSheet("font-weight: 700; font-size: 15px;")
        layout.addWidget(title_label)

        description_label = QLabel(description)
        description_label.setWordWrap(True)
        description_label.setStyleSheet("color: #5b6472;")
        layout.addWidget(description_label)

        value_label = QLabel(initial_value)
        value_label.setWordWrap(True)
        value_label.setStyleSheet("font-weight: 600;")
        layout.addWidget(value_label)

        button = QPushButton(button_text)
        button.setProperty("primary", primary)
        if not primary:
            button.setProperty("secondary", True)
        button.clicked.connect(callback)
        layout.addWidget(button, alignment=Qt.AlignLeft)
        layout.addStretch(1)
        return card, value_label

    def select_templates(self) -> None:
        files, _ = QFileDialog.getOpenFileNames(
            self,
            "Selecciona plantillas",
            "",
            "Plantillas (*.docx *.html *.htm)",
        )
        if not files:
            return
        paths = [Path(file) for file in files[:4]]
        try:
            self.templates = load_template_specs(paths)
        except Exception as error:  # pragma: no cover - UI guard
            QMessageBox.critical(self, "No se pudieron cargar las plantillas", str(error))
            return
        self.batch_plan = None
        self._set_status("Plantillas cargadas correctamente.", 33)
        self.refresh_ui()

    def select_excel(self) -> None:
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Selecciona Excel",
            "",
            "Excel (*.xlsx *.csv)",
        )
        if not file_path:
            return
        try:
            self.workbook = load_workbook_data(Path(file_path))
        except Exception as error:  # pragma: no cover - UI guard
            QMessageBox.critical(self, "No se pudo abrir el Excel", str(error))
            return
        self.batch_plan = None
        self._set_status("Excel cargado correctamente.", 66)
        self.refresh_ui()

    def build_batch(self) -> None:
        if not self.templates:
            raise ValueError("Selecciona al menos una plantilla.")
        if not self.workbook or not self.workbook.rows:
            raise ValueError("Carga un Excel con registros.")
        self.batch_plan = build_batch_plan(self.workbook, self.templates)

    def export_manifest(self) -> None:
        try:
            self.build_batch()
            batch_dir = export_batch_plan(self.batch_plan, self.output_root)
        except Exception as error:  # pragma: no cover - UI guard
            QMessageBox.warning(self, "No se pudo guardar la estructura", str(error))
            return
        self.last_output_path = batch_dir
        self.refresh_ui()
        QMessageBox.information(
            self,
            "Estructura guardada",
            f"Se guardo una carpeta de trabajo en:\n{batch_dir}",
        )

    def generate_pdfs(self) -> None:
        try:
            self._set_status("Preparando documentos...", 75)
            self.build_batch()
        except Exception as error:  # pragma: no cover - UI guard
            QMessageBox.warning(self, "Faltan datos", str(error))
            return

        if self.batch_plan.missing_columns:
            missing = ", ".join(self.batch_plan.missing_columns)
            QMessageBox.warning(
                self,
                "Faltan columnas en el Excel",
                f"El archivo no tiene estas columnas necesarias:\n{missing}",
            )
            self._set_status("Corrige el Excel antes de continuar.", 66)
            self.refresh_ui()
            return

        try:
            self._set_status("Generando PDF, por favor espera...", 90)
            batch_dir = export_batch_plan(self.batch_plan, self.output_root)
            batch_dir = generate_batch_pdfs(self.batch_plan, self.output_root)
        except Exception as error:  # pragma: no cover - UI guard
            self._set_status("Ocurrio un error durante la generacion.", 66)
            QMessageBox.critical(self, "No se pudieron generar los documentos", str(error))
            return

        self._set_status("Listo. Los documentos ya fueron generados.", 100)
        self.last_output_path = batch_dir
        self.refresh_ui()
        generated = sum(1 for document in self.batch_plan.documents if document.status == "READY")
        skipped = sum(1 for document in self.batch_plan.documents if document.status == "SKIPPED")
        message = f"Se generaron {generated} PDF(s)."
        if skipped:
            message += f"\n{skipped} documento(s) quedaron pendientes porque no eran HTML."
        message += f"\n\nCarpeta de salida:\n{batch_dir}"
        dialog = QMessageBox(self)
        dialog.setIcon(QMessageBox.Information)
        dialog.setWindowTitle("Proceso terminado")
        dialog.setText(message)
        copy_button = dialog.addButton("Copiar ruta", QMessageBox.ActionRole)
        dialog.addButton(QMessageBox.Ok)
        dialog.exec()
        if dialog.clickedButton() is copy_button:
            self._copy_path_to_clipboard(batch_dir)
            QMessageBox.information(
                self,
                "Ruta copiada",
                f"Se copio esta ruta al portapapeles:\n{batch_dir}",
            )

    def show_output_folder(self) -> None:
        path_to_show = self.last_output_path or self.output_root
        QMessageBox.information(
            self,
            "Carpeta de salida",
            f"Los documentos se guardan en:\n{path_to_show}",
        )

    def copy_output_path(self) -> None:
        path_to_copy = self.last_output_path or self.output_root
        self._copy_path_to_clipboard(path_to_copy)
        QMessageBox.information(
            self,
            "Ruta copiada",
            f"Se copio esta ruta al portapapeles:\n{path_to_copy}",
        )

    def _copy_path_to_clipboard(self, path_value: Path) -> None:
        clipboard = QApplication.clipboard()
        clipboard.setText(str(path_value))

    def login_to_system(self) -> None:
        try:
            session = login_to_api(
                self.api_base_input.text().strip(),
                self.api_email_input.text().strip(),
                self.api_password_input.text(),
            )
        except Exception as error:  # pragma: no cover - UI guard
            QMessageBox.warning(self, "No se pudo conectar", str(error))
            return

        self.api_session = session
        org_text = session.organization_id or "sin organizacion"
        self.connection_status.setText(f"Conectado como {session.email} ({org_text}).")
        self._set_status("Conexion al sistema lista.", max(self.progress.value(), 70))

    def upload_to_system(self) -> None:
        if not self.api_session:
            QMessageBox.warning(self, "Falta conexion", "Primero conecta la app con el sistema web.")
            return
        if not self.batch_plan:
            QMessageBox.warning(self, "Faltan documentos", "Primero genera los documentos.")
            return

        try:
            self._set_status("Subiendo documentos al sistema...", 95)
            payload = upload_batch_to_api(self.api_session, self.batch_plan)
        except Exception as error:  # pragma: no cover - UI guard
            QMessageBox.critical(self, "No se pudo subir el lote", str(error))
            self._set_status("La subida no se completo.", 100)
            return

        batch = payload.get("batch") or {}
        self.last_uploaded_batch_id = str(batch.get("id") or "").strip()
        self.connection_status.setText(
            f"Lote subido al sistema. ID: {batch.get('id', 'sin-id')}."
        )
        self._set_status("Documentos subidos al sistema.", 100)
        QMessageBox.information(
            self,
            "Documentos subidos",
            f"El lote fue recibido por el sistema.\n\nID: {batch.get('id', 'sin-id')}",
        )

    def open_web_history(self) -> None:
        email = self.api_email_input.text().strip()
        password = self.api_password_input.text()
        api_base = self.api_base_input.text().strip()
        if not email or not password:
            QMessageBox.warning(
                self,
                "Faltan credenciales",
                "Escribe correo y contrasena para abrir la web con acceso directo.",
            )
            return
        try:
            web_url = open_web_history_from_desktop(
                api_base=api_base,
                email=email,
                password=password,
                batch_id=self.last_uploaded_batch_id or None,
            )
        except Exception as error:  # pragma: no cover - UI guard
            QMessageBox.warning(self, "No se pudo abrir la web", str(error))
            return

        message = "Se abrio el historial web en el navegador."
        if self.last_uploaded_batch_id:
            message += f"\n\nLote enfocado: {self.last_uploaded_batch_id}"
        message += f"\n\nURL:\n{web_url}"
        QMessageBox.information(self, "Web abierta", message)

    def refresh_ui(self) -> None:
        headers = self.workbook.headers if self.workbook else []
        rows = self.workbook.rows if self.workbook else []

        self.table.clear()
        self.table.setRowCount(len(rows))
        self.table.setColumnCount(len(headers))
        self.table.setHorizontalHeaderLabels(headers)

        for row_index, row in enumerate(rows):
            for column_index, header in enumerate(headers):
                item = QTableWidgetItem(row.get(header, ""))
                item.setFlags(item.flags() ^ Qt.ItemIsEditable)
                self.table.setItem(row_index, column_index, item)

        self.templates_value.setText(self._templates_text())
        self.excel_value.setText(self._excel_text())
        self.generate_value.setText(self._generate_text())
        self.summary_box.setPlainText(self._build_summary_text())

    def _templates_text(self) -> str:
        if not self.templates:
            return "No has cargado plantillas."
        html_count = sum(1 for template in self.templates if template.kind in {"html", "htm"})
        return (
            f"{len(self.templates)} plantilla(s) cargadas.\n"
            f"{html_count} lista(s) para generar PDF."
        )

    def _excel_text(self) -> str:
        if not self.workbook:
            return "No has cargado Excel."
        return (
            f"Archivo: {self.workbook.source_path.name}\n"
            f"Registros encontrados: {len(self.workbook.rows)}"
        )

    def _generate_text(self) -> str:
        if not self.batch_plan:
            if self.templates and self.workbook:
                return "Todo listo para generar."
            return "Aun no hay documentos generados."
        generated = sum(1 for document in self.batch_plan.documents if document.status == "READY")
        if generated:
            return f"Se generaron {generated} PDF(s)."
        return f"Se prepararan {len(self.batch_plan.documents)} documento(s)."

    def _build_summary_text(self) -> str:
        lines: list[str] = []
        lines.append("Resumen simple")
        lines.append("")

        if not self.templates:
            lines.append("- Falta seleccionar las plantillas.")
        else:
            html_templates = [template.name for template in self.templates if template.kind in {"html", "htm"}]
            docx_templates = [template.name for template in self.templates if template.kind == "docx"]
            lines.append(f"- Plantillas cargadas: {len(self.templates)}")
            if html_templates:
                lines.append(f"- Listas para PDF: {', '.join(html_templates)}")
            if docx_templates:
                lines.append(f"- Pendientes por ahora: {', '.join(docx_templates)}")

        if not self.workbook:
            lines.append("- Falta cargar el Excel.")
        else:
            lines.append(f"- Registros del Excel: {len(self.workbook.rows)}")
            lines.append(f"- Archivo cargado: {self.workbook.source_path.name}")

        if self.batch_plan:
            if self.batch_plan.missing_columns:
                lines.append("")
                lines.append("Columnas faltantes en el Excel:")
                for name in self.batch_plan.missing_columns:
                    lines.append(f"- {name}")
            else:
                total = len(self.batch_plan.documents)
                generated = sum(1 for document in self.batch_plan.documents if document.status == "READY")
                skipped = sum(1 for document in self.batch_plan.documents if document.status == "SKIPPED")
                lines.append("")
                lines.append(f"- Documentos esperados: {total}")
                lines.append(f"- PDF generados: {generated}")
                if skipped:
                    lines.append(f"- Pendientes por formato DOCX: {skipped}")
                if generated:
                    lines.append("")
                    lines.append("Primeros documentos generados:")
                    shown = 0
                    for document in self.batch_plan.documents:
                        if document.status != "READY":
                            continue
                        lines.append(f"- Fila {document.row_index + 1}: {Path(document.pdf_path).name}")
                        shown += 1
                        if shown >= 6:
                            break
        else:
            lines.append("")
            lines.append("- Despues de cargar plantillas y Excel, pulsa Generar documentos.")

        return "\n".join(lines)

    def _set_status(self, text: str, progress: int) -> None:
        self.status_label.setText(f"Estado: {text}")
        self.progress.setValue(progress)
