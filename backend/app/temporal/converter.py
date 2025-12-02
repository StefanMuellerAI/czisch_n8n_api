"""
XML Converter: Converts SAP IDoc XML to Taifun XML format.
"""

import xml.etree.ElementTree as ET
from datetime import datetime


def parse_sap_date(sap_date_str: str) -> str:
    """Wandelt SAP Datum (YYYYMMDD) in Taifun Format (YYYY-MM-DD) um."""
    if not sap_date_str:
        return ""
    try:
        dt = datetime.strptime(sap_date_str, "%Y%m%d")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return sap_date_str


def clean_text_line(text: str | None) -> str:
    """Entfernt Steuerzeichen oder CDATA Reste falls nötig."""
    if text is None:
        return ""
    return text.strip()


def convert_sap_to_taifun(xml_content: str) -> str:
    """
    Nimmt einen XML-String (SAP IDoc) entgegen und gibt einen XML-String (Taifun) zurück.
    
    Args:
        xml_content: SAP IDoc XML string
        
    Returns:
        Taifun XML string
    """
    
    # 1. SAP XML Parsen
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        return f"Error parsing XML: {e}"

    # --- DATEN EXTRAKTION ---
    
    data = {
        'BestellNr': '',
        'Date': '',
        'KdMatch': '',
        'KdNr': '10400',  # Default oder Mapping
        'MtName1': '',
        'MtName2': '',
        'MtStr': '',
        'MtPLZ': '',
        'MtOrt': '',
        'VortextTxt': [],
        'Info': ''
    }

    # Kopfdaten (E1EDK01 / E1EDK03)
    segment_k01 = root.find(".//E1EDK01")
    if segment_k01 is not None:
        data['BestellNr'] = segment_k01.findtext("BELNR", "")

    # Suche Datum
    segment_k03 = root.find(".//E1EDK03")
    if segment_k03 is not None:
        raw_date = segment_k03.findtext("DATUM", "")
        data['Date'] = parse_sap_date(raw_date)

    # Partnerdaten (E1EDKA1) - Loop durch alle Partner
    for partner in root.findall(".//E1EDKA1"):
        parvw = partner.findtext("PARVW")
        
        # AG = Auftraggeber (Kunde)
        if parvw == 'AG':
            org_tx = partner.findtext("ORGTX")
            if org_tx == 'IMD':
                data['KdMatch'] = 'IMD'
                data['KdNr'] = '10400'
        
        # WE = Warenempfänger (Montageort)
        elif parvw == 'WE':
            data['MtName1'] = partner.findtext("NAME1", "")
            data['MtName2'] = partner.findtext("NAME2", "")
            strasse = partner.findtext("STRAS", "")
            hausnr = partner.findtext("HAUSN", "")
            data['MtStr'] = f"{strasse} {hausnr}".strip()
            data['MtPLZ'] = partner.findtext("PSTLZ", "")
            data['MtOrt'] = partner.findtext("ORT01", "")

    # Texte / Langtexte (E1EDP01 -> E1EDPT1 -> E1EDPT2)
    position = root.find(".//E1EDP01")
    if position:
        for text_header in position.findall("E1EDPT1"):
            for text_line in text_header.findall("E1EDPT2"):
                line_content = text_line.findtext("TDLINE", "")
                if line_content:
                    clean = line_content.replace("<B>", "").replace("</>", "").replace("*", "").strip()
                    if clean:
                        data['VortextTxt'].append(clean)

    # Info-Feld füllen
    if data['VortextTxt']:
        data['Info'] = data['VortextTxt'][1] if len(data['VortextTxt']) > 1 else data['VortextTxt'][0]
    
    full_text = "\n".join(data['VortextTxt'])

    # --- TAIFUN XML ERSTELLUNG ---

    tf_root = ET.Element("AhList")
    tf_root.set("xmlns", "urn:taifun-software.de:schema:TAIFUN")
    
    ah = ET.SubElement(tf_root, "Ah")

    def add_field(parent, tag, value):
        elem = ET.SubElement(parent, tag)
        elem.text = str(value)

    # 1. Identifikation & Datum
    add_field(ah, "BestellNr", data['BestellNr'])
    add_field(ah, "Date", data['Date'])
    add_field(ah, "DateDesc", data['Date'])
    add_field(ah, "Info", data['Info'])
    
    # 2. Status Flags
    add_field(ah, "AhOffen", "true")
    add_field(ah, "Erledigt", "false")
    add_field(ah, "Gedruckt", "false")
    add_field(ah, "Storno", "false")
    add_field(ah, "RechnungGebucht", "false")
    add_field(ah, "AhMobile", "true")

    # 3. Kundendaten (Abrechnung)
    add_field(ah, "KdMatch", data['KdMatch'])
    add_field(ah, "KdNr", data['KdNr'])

    # 4. Montageort
    add_field(ah, "MtName1", data['MtName1'])
    add_field(ah, "MtName2", data['MtName2'])
    add_field(ah, "MtStr", data['MtStr'])
    add_field(ah, "MtAnschriftPLZ", data['MtPLZ'])
    add_field(ah, "MtOrt", f"{data['MtPLZ']} {data['MtOrt']}")
    
    # 5. Langtext / Aufgabenbeschreibung
    add_field(ah, "VortextTxt", full_text)

    # 6. Technische Standardwerte
    add_field(ah, "KlkLohnGruppe", "1")
    add_field(ah, "KlkMatMulti", "1.30")
    add_field(ah, "KlkZuschlagMat", "0.35")
    add_field(ah, "KlkZuschlagLNK", "1.65")
    
    # XML in String umwandeln
    rough_string = ET.tostring(tf_root, encoding='unicode')
    
    # XML Header hinzufügen
    final_xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + rough_string
    
    return final_xml

