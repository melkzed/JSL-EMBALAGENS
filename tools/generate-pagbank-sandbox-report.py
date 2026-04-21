from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path
from textwrap import wrap


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = ROOT / "pagbank-evidencias-20260421"
OUTPUT_MD = ROOT / "docs" / "relatorio-testes-sandbox-pagbank-preenchido-20260421.md"
OUTPUT_PDF = ROOT / "docs" / "relatorio-testes-sandbox-pagbank-preenchido-20260421.pdf"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def pretty(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def compact_value(value):
    if value in (None, ""):
        return "N/A"
    return str(value)


def scenario_result(response):
    if isinstance(response, dict) and response.get("success") is True:
        return "SUCESSO"
    if isinstance(response, dict) and response.get("success") is False:
        return "RETORNO COM ERRO"
    return "REGISTRADO"


def one_line_response(response):
    if not isinstance(response, dict):
        return str(response)
    if response.get("checkoutId"):
        return response["checkoutId"]
    if response.get("errorCode"):
        return f'{response.get("errorCode")}: {", ".join(response.get("errors", []))}'
    if response.get("session"):
        return "session retornada"
    if response.get("publicKey"):
        return "publicKey retornada"
    return json.dumps(response, ensure_ascii=False)


def read_scenario(test_id: str):
    request = load_json(EVIDENCE_DIR / f"{test_id}-request.json")
    response = load_json(EVIDENCE_DIR / f"{test_id}-response.json")
    meta = load_json(EVIDENCE_DIR / f"{test_id}-meta.json")
    return request, response, meta


MAIN_SCENARIOS = [
    ("CC-01-checkout-credito", "Fluxo 1 - Cartao de Credito", "Validar criacao de checkout hospedado em Sandbox para pagamento com cartao de credito."),
    ("DB-01-checkout-debito", "Fluxo 2 - Cartao de Debito", "Validar criacao de checkout hospedado em Sandbox para pagamento com cartao de debito."),
    ("PIX-01-checkout-pix", "Fluxo 3 - PIX", "Validar criacao de checkout hospedado em Sandbox para pagamento via PIX."),
]

INFRA_SCENARIOS = [
    ("INF-01-get-public-key", "Infra 1 - Obter chave publica"),
    ("INF-02-create-3ds-session", "Infra 2 - Criar sessao 3DS"),
]

DIRECT_SCENARIOS = [
    ("CC-02-charge-direta-credito", "Anexo - Charge direta credito"),
    ("DB-02-charge-direta-debito", "Anexo - Charge direta debito"),
]


def required_evidence_files():
    scenarios = [item[0] for item in INFRA_SCENARIOS]
    scenarios.extend(item[0] for item in MAIN_SCENARIOS)
    scenarios.extend(item[0] for item in DIRECT_SCENARIOS)

    files = []
    for test_id in scenarios:
        files.extend([
            EVIDENCE_DIR / f"{test_id}-request.json",
            EVIDENCE_DIR / f"{test_id}-response.json",
            EVIDENCE_DIR / f"{test_id}-meta.json",
        ])
    return files


def evidence_ready():
    if not EVIDENCE_DIR.exists():
        print(f"Nenhuma evidencia encontrada em {EVIDENCE_DIR}. Nada para gerar.")
        return False

    missing = [path for path in required_evidence_files() if not path.exists()]
    if missing:
        print("Evidencias incompletas. Arquivos ausentes:")
        for path in missing:
            print(f"- {path}")
        return False

    return True


def build_markdown():
    OUTPUT_MD.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "# Relatorio de Testes - Sandbox PagBank - Homologacao",
        "",
        "**Data do relatorio:** 21/04/2026",
        "**Projeto:** JSL Embalagens",
        "**Ambiente:** Sandbox",
        "**Endpoint testado:** `https://otwmjdiqjhumqvyztnbl.supabase.co/functions/v1/processar-pagamento-pagseguro`",
        "**Solicitante:** Gabriel de Souza Santos (PagBank)",
        "",
        "## Campos que precisavam ser preenchidos",
        "",
        "- Requests completos de credito, debito e PIX.",
        "- Responses reais retornados pelo Sandbox.",
        "- Data/hora de cada teste.",
        "- Endpoint, status HTTP, trace_id, sb_request_id e identificadores retornados.",
        "- Observacoes de seguranca com headers sensiveis mascarados.",
        "",
        "## Resumo executivo",
        "",
        "| ID | Cenario | HTTP | Resultado | ID principal |",
        "|---|---|---:|---|---|",
    ]

    for test_id, title in INFRA_SCENARIOS:
        _, response, meta = read_scenario(test_id)
        lines.append(f"| {test_id} | {title} | {meta['http_status']} | {scenario_result(response)} | {one_line_response(response)} |")

    for test_id, title, _ in MAIN_SCENARIOS:
        _, response, meta = read_scenario(test_id)
        lines.append(f"| {test_id} | {title} | {meta['http_status']} | {scenario_result(response)} | {one_line_response(response)} |")

    lines.extend([
        "",
        "## Observacao tecnica importante",
        "",
        "O fluxo implementado e testado no site cria checkout hospedado no PagBank. "
        "Assim, os testes de credito, debito e PIX abaixo registram a criacao real de checkouts em Sandbox, "
        "com `checkoutId` e URL de pagamento retornados pelo PagBank.",
        "",
        "As tentativas de charge direta com cartao criptografado tambem foram registradas como anexo, mas retornaram erro de parametro "
        "porque a execucao por CLI nao passou por criptografia real do SDK do PagBank.",
        "",
    ])

    for test_id, title, objective in MAIN_SCENARIOS:
        request, response, meta = read_scenario(test_id)
        lines.extend([
            f"## {title}",
            "",
            f"**Objetivo:** {objective}",
            f"**Data/hora:** `{meta['timestamp']}`",
            f"**Endpoint:** `{meta['endpoint']}`",
            f"**Status HTTP:** `{meta['http_status']}`",
            f"**trace_id:** `{meta['trace_id']}`",
            f"**sb_request_id:** `{compact_value(meta.get('sb_request_id'))}`",
            f"**Resultado:** `{scenario_result(response)}`",
            "",
            "### Request completo",
            "",
            "```json",
            pretty(request),
            "```",
            "",
            "### Response completo",
            "",
            "```json",
            pretty(response),
            "```",
            "",
        ])

    lines.extend([
        "## Evidencias de infraestrutura",
        "",
    ])

    for test_id, title in INFRA_SCENARIOS:
        request, response, meta = read_scenario(test_id)
        lines.extend([
            f"### {title}",
            "",
            f"- **Data/hora:** `{meta['timestamp']}`",
            f"- **Status HTTP:** `{meta['http_status']}`",
            f"- **trace_id:** `{meta['trace_id']}`",
            f"- **sb_request_id:** `{compact_value(meta.get('sb_request_id'))}`",
            "",
            "**Request**",
            "",
            "```json",
            pretty(request),
            "```",
            "",
            "**Response**",
            "",
            "```json",
            pretty(response),
            "```",
            "",
        ])

    lines.extend([
        "## Anexo - charge direta",
        "",
        "Estes testes foram executados para registrar o comportamento do endpoint de charge direta. "
        "Eles nao substituem o fluxo principal de checkout hospedado.",
        "",
    ])

    for test_id, title in DIRECT_SCENARIOS:
        request, response, meta = read_scenario(test_id)
        lines.extend([
            f"### {title}",
            "",
            f"- **Data/hora:** `{meta['timestamp']}`",
            f"- **Status HTTP:** `{meta['http_status']}`",
            f"- **Resultado:** `{scenario_result(response)}`",
            "",
            "**Request**",
            "",
            "```json",
            pretty(request),
            "```",
            "",
            "**Response**",
            "",
            "```json",
            pretty(response),
            "```",
            "",
        ])

    lines.extend([
        "## Observacoes de seguranca",
        "",
        "- Headers `Authorization` e `apikey` foram mascarados.",
        "- O token PagBank e as chaves privadas da Supabase nao foram expostos.",
        "- Os dados de comprador usados sao dados de teste.",
        "- Os arquivos JSON completos da execucao estao na pasta `pagbank-evidencias-20260421`.",
        "",
        "## Mensagem de encaminhamento",
        "",
        "Ola, Gabriel. Tudo bem?",
        "",
        "Conforme solicitado, envio em anexo os logs reais de request/response executados em Sandbox para os fluxos de cartao de credito, cartao de debito e PIX. "
        "O material inclui endpoint, status HTTP, data/hora, trace_id, sb_request_id e identificadores de checkout retornados pelo PagBank.",
        "",
        "Fico a disposicao para qualquer ajuste complementar.",
    ])

    OUTPUT_MD.write_text("\n".join(lines), encoding="utf-8")

def code_block(text: str, style, preformatted_cls):
    paragraphs = []
    for line in text.splitlines():
        if len(line) <= 108:
            paragraphs.append(line)
        else:
            paragraphs.extend(wrap(line, 108, break_long_words=True, break_on_hyphens=False))
    return preformatted_cls("\n".join(paragraphs), style)


def load_reportlab():
    try:
        colors_module = importlib.import_module("reportlab.lib.colors")
        enums_module = importlib.import_module("reportlab.lib.enums")
        pagesizes_module = importlib.import_module("reportlab.lib.pagesizes")
        styles_module = importlib.import_module("reportlab.lib.styles")
        units_module = importlib.import_module("reportlab.lib.units")
        platypus_module = importlib.import_module("reportlab.platypus")
    except ModuleNotFoundError:
        return None

    return {
        "colors": colors_module,
        "TA_CENTER": enums_module.TA_CENTER,
        "TA_LEFT": enums_module.TA_LEFT,
        "A4": pagesizes_module.A4,
        "ParagraphStyle": styles_module.ParagraphStyle,
        "getSampleStyleSheet": styles_module.getSampleStyleSheet,
        "cm": units_module.cm,
        "PageBreak": platypus_module.PageBreak,
        "Paragraph": platypus_module.Paragraph,
        "Preformatted": platypus_module.Preformatted,
        "SimpleDocTemplate": platypus_module.SimpleDocTemplate,
        "Spacer": platypus_module.Spacer,
        "Table": platypus_module.Table,
        "TableStyle": platypus_module.TableStyle,
    }


def build_pdf():
    reportlab = load_reportlab()
    if reportlab is None:
        print("PDF nao gerado: biblioteca 'reportlab' nao esta instalada.")
        return False

    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)

    colors = reportlab["colors"]
    TA_CENTER = reportlab["TA_CENTER"]
    TA_LEFT = reportlab["TA_LEFT"]
    A4 = reportlab["A4"]
    ParagraphStyle = reportlab["ParagraphStyle"]
    getSampleStyleSheet = reportlab["getSampleStyleSheet"]
    cm = reportlab["cm"]
    PageBreak = reportlab["PageBreak"]
    Paragraph = reportlab["Paragraph"]
    Preformatted = reportlab["Preformatted"]
    SimpleDocTemplate = reportlab["SimpleDocTemplate"]
    Spacer = reportlab["Spacer"]
    Table = reportlab["Table"]
    TableStyle = reportlab["TableStyle"]

    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(1.5 * cm, 1 * cm, "Documento confidencial - uso restrito | JSL Embalagens")
        canvas.drawRightString(19.5 * cm, 1 * cm, f"Pagina {doc.page}")
        canvas.restoreState()

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TitleCustom",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=21,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#18324a"),
        spaceAfter=14,
    )
    h1 = ParagraphStyle(
        "H1Custom",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#18324a"),
        spaceBefore=10,
        spaceAfter=7,
    )
    h2 = ParagraphStyle(
        "H2Custom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=colors.HexColor("#18324a"),
        spaceBefore=8,
        spaceAfter=5,
    )
    normal = ParagraphStyle(
        "NormalCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        alignment=TA_LEFT,
        spaceAfter=5,
    )
    code = ParagraphStyle(
        "CodeCustom",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=6.1,
        leading=7.1,
        leftIndent=0,
        rightIndent=0,
        borderColor=colors.HexColor("#d9dee7"),
        borderWidth=0.4,
        borderPadding=5,
        backColor=colors.HexColor("#f7f9fc"),
        spaceAfter=8,
    )

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        rightMargin=1.3 * cm,
        leftMargin=1.3 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.6 * cm,
        title="Relatorio de Testes Sandbox PagBank",
    )

    story = [
        Paragraph("Relatorio de Testes - Sandbox PagBank - Homologacao", title),
        Paragraph("<b>Data do relatorio:</b> 21/04/2026", normal),
        Paragraph("<b>Projeto:</b> JSL Embalagens", normal),
        Paragraph("<b>Ambiente:</b> Sandbox", normal),
        Paragraph("<b>Solicitante:</b> Gabriel de Souza Santos (PagBank)", normal),
        Paragraph("<b>Endpoint testado:</b> https://otwmjdiqjhumqvyztnbl.supabase.co/functions/v1/processar-pagamento-pagseguro", normal),
        Spacer(1, 6),
        Paragraph("Campos preenchidos", h1),
        Paragraph("Foram preenchidos os requests, responses, data/hora, endpoint, status HTTP, trace_id, sb_request_id e identificadores de checkout para credito, debito e PIX.", normal),
    ]

    table_data = [["ID", "Cenario", "HTTP", "Resultado", "ID principal"]]
    for test_id, title_text in INFRA_SCENARIOS:
        _, response, meta = read_scenario(test_id)
        table_data.append([test_id, title_text, str(meta["http_status"]), scenario_result(response), one_line_response(response)])
    for test_id, title_text, _ in MAIN_SCENARIOS:
        _, response, meta = read_scenario(test_id)
        table_data.append([test_id, title_text, str(meta["http_status"]), scenario_result(response), one_line_response(response)])

    summary = Table(table_data, colWidths=[3.4 * cm, 4.6 * cm, 1.2 * cm, 2.6 * cm, 6.2 * cm], repeatRows=1)
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#18324a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 6.7),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c9d1dd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
    ]))
    story.extend([summary, Spacer(1, 8)])

    story.extend([
        Paragraph("Observacao tecnica", h1),
        Paragraph("O fluxo implementado e testado no site cria checkout hospedado no PagBank. Os testes de credito, debito e PIX abaixo registram a criacao real de checkouts em Sandbox, com checkoutId e URL de pagamento retornados pelo PagBank.", normal),
        Paragraph("As tentativas de charge direta com cartao criptografado foram registradas em anexo, mas retornaram erro de parametro porque a execucao por CLI nao passou por criptografia real do SDK do PagBank.", normal),
    ])

    for test_id, title_text, objective in MAIN_SCENARIOS:
        request, response, meta = read_scenario(test_id)
        story.extend([
            PageBreak(),
            Paragraph(title_text, h1),
            Paragraph(f"<b>Objetivo:</b> {objective}", normal),
            Paragraph(f"<b>Data/hora:</b> {meta['timestamp']}", normal),
            Paragraph(f"<b>Endpoint:</b> {meta['endpoint']}", normal),
            Paragraph(f"<b>Status HTTP:</b> {meta['http_status']}", normal),
            Paragraph(f"<b>trace_id:</b> {meta['trace_id']}", normal),
            Paragraph(f"<b>sb_request_id:</b> {compact_value(meta.get('sb_request_id'))}", normal),
            Paragraph(f"<b>Resultado:</b> {scenario_result(response)}", normal),
            Paragraph("Request completo", h2),
            code_block(pretty(request), code, Preformatted),
            Paragraph("Response completo", h2),
            code_block(pretty(response), code, Preformatted),
        ])

    story.extend([
        PageBreak(),
        Paragraph("Evidencias de infraestrutura", h1),
    ])

    for test_id, title_text in INFRA_SCENARIOS:
        request, response, meta = read_scenario(test_id)
        story.extend([
            Paragraph(title_text, h2),
            Paragraph(f"<b>Data/hora:</b> {meta['timestamp']} | <b>Status HTTP:</b> {meta['http_status']} | <b>trace_id:</b> {meta['trace_id']} | <b>sb_request_id:</b> {compact_value(meta.get('sb_request_id'))}", normal),
            Paragraph("Request", h2),
            code_block(pretty(request), code, Preformatted),
            Paragraph("Response", h2),
            code_block(pretty(response), code, Preformatted),
        ])

    story.extend([
        PageBreak(),
        Paragraph("Anexo - charge direta", h1),
        Paragraph("Estes testes foram executados para registrar o comportamento do endpoint de charge direta. Eles nao substituem o fluxo principal de checkout hospedado.", normal),
    ])

    for test_id, title_text in DIRECT_SCENARIOS:
        request, response, meta = read_scenario(test_id)
        story.extend([
            Paragraph(title_text, h2),
            Paragraph(f"<b>Data/hora:</b> {meta['timestamp']} | <b>Status HTTP:</b> {meta['http_status']} | <b>Resultado:</b> {scenario_result(response)}", normal),
            Paragraph("Request", h2),
            code_block(pretty(request), code, Preformatted),
            Paragraph("Response", h2),
            code_block(pretty(response), code, Preformatted),
        ])

    story.extend([
        Paragraph("Observacoes de seguranca", h1),
        Paragraph("Headers Authorization e apikey foram mascarados. O token PagBank e as chaves privadas da Supabase nao foram expostos. Os dados de comprador usados sao dados de teste.", normal),
        Paragraph("Mensagem de encaminhamento", h1),
        Paragraph("Ola, Gabriel. Tudo bem?", normal),
        Paragraph("Conforme solicitado, envio em anexo os logs reais de request/response executados em Sandbox para os fluxos de cartao de credito, cartao de debito e PIX. O material inclui endpoint, status HTTP, data/hora, trace_id, sb_request_id e identificadores de checkout retornados pelo PagBank.", normal),
        Paragraph("Fico a disposicao para qualquer ajuste complementar.", normal),
    ])

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    return True


if __name__ == "__main__":
    if not evidence_ready():
        sys.exit(0)

    build_markdown()
    pdf_created = build_pdf()
    print(OUTPUT_MD)
    if pdf_created:
        print(OUTPUT_PDF)
