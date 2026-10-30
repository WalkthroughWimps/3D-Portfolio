"""Build a searchable, bookmarked PDF from a guide chapter's Markdown source."""
from pathlib import Path
import argparse, csv, html, io, json, re, subprocess, zipfile
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak, Preformatted, Table, TableStyle, KeepTogether, Image
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/site-guide'
FONT=Path('C:/Windows/Fonts')
for name,file in [('Guide','segoeui.ttf'),('GuideBold','segoeuib.ttf'),('GuideMono','consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(FONT/file)))
pdfmetrics.registerFontFamily('Guide',normal='Guide',bold='GuideBold',italic='Guide',boldItalic='GuideBold')
NAVY=colors.HexColor('#142b43');TEAL=colors.HexColor('#087c87');GREY=colors.HexColor('#536174')
GUIDES = [
    ('00-complete-condensed-guide', 'Complete condensed guide'),
    ('01-everyday-updates-and-saving', '1. Everyday updates and saving'),
    ('02-settings-constructor-and-shared-interface', '2. Settings and shared interface'),
    ('03-about-cube-and-faces', '3. About cube and faces'),
    ('04-page-content-and-document-library', '4. Page content and document library'),
    ('05-video-music-and-instruments', '5. Video, Music and instruments'),
    ('06-assets-layout-and-web-performance', '6. Assets, layout and performance'),
    ('07-troubleshooting-validation-and-maintenance', '7. Troubleshooting and maintenance'),
    ('08-task-to-script-reference', '8. Where to change things'),
    ('09-script-function-index', '9. Script and function index'),
    ('10-settings-field-reference', '10. Settings field reference'),
    ('11-asset-source-reference', '11. Asset and source reference'),
]
REFERENCE_SOURCE = ROOT / 'docs/user-guide/08-task-to-script-reference.json'
styles={
 'body':ParagraphStyle('body',fontName='Guide',fontSize=10,leading=15,spaceAfter=7,textColor=NAVY,splitLongWords=True),
 'h1':ParagraphStyle('h1',fontName='GuideBold',fontSize=17,leading=22,spaceBefore=17,spaceAfter=10,textColor=NAVY,keepWithNext=True),
 'h2':ParagraphStyle('h2',fontName='GuideBold',fontSize=12.5,leading=17,spaceBefore=12,spaceAfter=7,textColor=TEAL,keepWithNext=True),
 'code':ParagraphStyle('code',fontName='GuideMono',fontSize=8,leading=11,backColor=colors.HexColor('#eef2f6'),borderPadding=8,spaceAfter=10),
 'title':ParagraphStyle('title',fontName='GuideBold',fontSize=29,leading=35,textColor=NAVY,spaceAfter=18),
 'sub':ParagraphStyle('sub',fontName='Guide',fontSize=12,leading=18,textColor=GREY,spaceAfter=14),
 'bullet':ParagraphStyle('bullet',fontName='Guide',fontSize=10,leading=15,leftIndent=12,firstLineIndent=-10,spaceAfter=5,textColor=NAVY),
}
def inline(s):
    s=s.replace('\u2011','-').replace('\u2013','-').replace('\u2014',' - ')
    s=html.escape(s,quote=False)
    s=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',lambda m:f'<link href="{html.escape(m[2],quote=True)}" color="#087c87">{m[1]}</link>',s)
    s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'\1 (\2)',s)
    s=re.sub(r'`([^`]+)`',r'<font name="GuideMono" size="8.5">\1</font>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
    return s

class GuideDoc(BaseDocTemplate):
    def __init__(self,path,title,snapshot='29 October 2026'):
        super().__init__(str(path),pagesize=A4,leftMargin=45,rightMargin=45,topMargin=52,bottomMargin=48,title=title,author='Matt Hall Portfolio',allowSplitting=True)
        self.label=title;self.counter=0;self.snapshot=snapshot;self.guide_stem=Path(path).stem
        frame=Frame(self.leftMargin,self.bottomMargin,self.width,self.height,id='normal',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='normal',frames=frame,onPage=self.footer))
    def beforeDocument(self):self.counter=0
    def footer(self,c,doc):
        c.saveState();w,h=A4;c.setStrokeColor(colors.HexColor('#d4dde6'));c.line(45,35,w-45,35)
        c.setFont('Guide',8);c.setFillColor(GREY);c.drawString(45,22,'Matt Hall portfolio | Maintenance guide | '+self.snapshot);c.drawRightString(w-45,22,str(doc.page));c.restoreState()
        # Keep navigation below the content frame, above the existing footer rule.
        stems = [stem for stem, _ in GUIDES]
        if self.guide_stem in stems:
            index = stems.index(self.guide_stem)
            links = [('Quick guide', stems[0]), ('Task lookup', stems[8]), ('Script index', stems[9])]
            if index > 0: links.append(('Previous', stems[index - 1]))
            if index + 1 < len(stems): links.append(('Next', stems[index + 1]))
            c.saveState(); c.setFont('Guide', 8); c.setFillColor(TEAL); x = 45
            for label, stem in links:
                if stem == self.guide_stem: continue
                width = c.stringWidth(label, 'Guide', 8)
                c.drawString(x, 39, label)
                c.linkURL(stem + '.pdf', (x, 37, x + width, 46), kind='GoToR', thickness=0)
                x += width + 18
            c.restoreState()
    def afterFlowable(self,flow):
        if hasattr(flow,'tocLevel'):
            key=f'section-{self.counter}';self.counter+=1
            self.canv.bookmarkPage(key);self.canv.addOutlineEntry(flow.getPlainText(),key,level=flow.tocLevel,closed=False)
            self.notify('TOCEntry',(flow.tocLevel,flow.getPlainText(),self.page,key))


def remote_link(label, filename, page=1):
    """Use a temporary URI that is converted to a portable remote PDF action."""
    return f'<link href="guide:{html.escape(filename, quote=True)}#page={page}" color="#087c87">{html.escape(label)}</link>'


def finish_pdf(target):
    reader = PdfReader(io.BytesIO(target.read_bytes()))
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    for page in writer.pages:
        for annotation in page.get('/Annots', []):
            link = annotation.get_object()
            action = link.get('/A')
            if not action or action.get('/S') != '/URI': continue
            uri = str(action.get('/URI', ''))
            if not uri.startswith('guide:'): continue
            filename, page_text = uri[6:].rsplit('#page=', 1)
            if Path(filename).name != filename or not filename.endswith('.pdf'):
                raise ValueError('Unsafe guide destination: ' + filename)
            link[NameObject('/A')] = DictionaryObject({
                NameObject('/S'): NameObject('/GoToR'),
                NameObject('/F'): TextStringObject(filename),
                NameObject('/D'): ArrayObject([NumberObject(int(page_text) - 1), NameObject('/Fit')]),
            })
    result = io.BytesIO(); writer.write(result); target.write_bytes(result.getvalue())
    checked = PdfReader(target)
    assert checked.outline and all((page.extract_text() or '').strip() for page in checked.pages)
    return checked


def validate_links(directory):
    readers = {stem + '.pdf': PdfReader(directory / (stem + '.pdf')) for stem, _ in GUIDES}
    total = 0
    for filename, reader in readers.items():
        for page in reader.pages:
            for ref in page.get('/Annots', []):
                action = ref.get_object().get('/A')
                if not action or action.get('/S') != '/GoToR': continue
                destination = str(action['/F'])
                if destination not in readers: raise ValueError(f'{filename}: missing PDF {destination}')
                page_number = int(action['/D'][0])
                if not 0 <= page_number < len(readers[destination].pages):
                    raise ValueError(f'{filename}: invalid page in {destination}')
                total += 1
    print(f'GUIDE_LINKS_OK {len(readers)} PDFs | {total} cross-PDF links', flush=True)


def package_guides(directory):
    destination = directory / 'site-maintenance-guide.zip'
    files = [directory / (stem + '.pdf') for stem, _ in GUIDES] + [directory / 'START-HERE.txt']
    files += [ROOT / 'docs/user-guide' / ('10-settings-field-reference' + suffix) for suffix in ['.csv', '.json']]
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for file in files: bundle.write(file, file.name)
    with zipfile.ZipFile(destination) as bundle:
        assert bundle.testzip() is None and len(bundle.namelist()) == len(files)
    print(f'GUIDE_BUNDLE_READY {destination} | {len(files)} files', flush=True)


def checked_reference(ref):
    file = (ROOT / ref['file']).resolve()
    if not file.is_relative_to(ROOT.resolve()): raise ValueError('Source outside workspace: ' + ref['file'])
    content = file.read_text(encoding='utf8')
    if ref['anchor'] not in content: raise ValueError('Stale anchor: ' + ref['file'] + ' :: ' + ref['anchor'])
    return content[:content.index(ref['anchor'])].count('\n') + 1


def task_pages(path):
    reader = PdfReader(path); result = {}
    def walk(outline):
        for item in outline:
            if isinstance(item, list): walk(item)
            else: result[item['/Title']] = reader.get_destination_page_number(item) + 1
    walk(reader.outline)
    return result


def symbol_name(anchor):
    declaration = re.search(r'\b(?:function|const|class)\s+([\w$]+)', anchor)
    return declaration.group(1) if declaration else anchor.strip(" '\"").split('(')[0]


def build_index(source, target):
    data = json.loads(source.read_text(encoding='utf8'))
    pages = task_pages(OUT / '08-task-to-script-reference.pdf')
    scripts = {}; symbols = {}
    for group in data['groups']:
        for task in group['tasks']:
            page = pages[task['title']]
            for ref in task['refs']:
                line = checked_reference(ref)
                entry = (ref['file'], ref['anchor'])
                symbols.setdefault(entry, {'line': line, 'role': ref['role'], 'tasks': []})['tasks'].append((task['title'], page))
                scripts.setdefault(ref['file'], set()).add(entry)
    title = 'Chapter 9 - Script and function index'
    story = [Paragraph(title, styles['title']), Paragraph('Alphabetical navigation | ' + data['snapshot'], styles['sub'])]
    for text in [
        'Find a script by filename, or a function/configuration anchor by name. Task links open the exact page of Chapter 8. This indexes the source references in the 36 recipes; it is not an inventory of every function in the repository.',
        'Keep the complete PDF set in the same folder. Cross-file navigation uses relative PDF links; opening them depends on the PDF reader and its local-file security policy. An individual PDF retains its own contents and bookmarks.',
        'Line numbers are regenerated from the local source. Use the named anchor after lines move. Source checks establish that the file and anchor exist, not that every UI workflow has passed browser acceptance.',
    ]: story.append(Paragraph(text, styles['body']))
    heading = Paragraph('Open a guide', styles['h1']); heading.tocLevel = 0; story.append(heading)
    for stem, label in GUIDES:
        if stem != target.stem:
            story.append(Paragraph(remote_link(label, stem + '.pdf'), styles['body']))
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle('index-toc0', parent=styles['body']), ParagraphStyle('index-toc1', parent=styles['body'], leftIndent=12, fontSize=9)]
    story += [Paragraph('Index sections', styles['h1']), toc, PageBreak()]
    cell = ParagraphStyle('index-cell', parent=styles['body'], fontSize=9, leading=13, spaceAfter=0)
    def task_links(tasks):
        return '<br/>'.join(remote_link(f'{title} (p. {page})', '08-task-to-script-reference.pdf', page) for title, page in sorted(set(tasks)))
    heading = Paragraph('Scripts A-Z', styles['h1']); heading.tocLevel = 0; story.append(heading)
    for filename in sorted(scripts, key=lambda name: (Path(name).name.casefold(), name.casefold())):
        rows = []
        for key in sorted(scripts[filename], key=lambda item: symbol_name(item[1]).casefold()):
            details = symbols[key]
            rows.append([Paragraph(inline('`' + key[1] + '`') + f'<br/>Line {details["line"]}', cell), Paragraph(task_links(details['tasks']), cell)])
        table = Table(rows, colWidths=[220, 285], hAlign='LEFT')
        table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(0,-1),colors.HexColor('#eef4f6')),('LINEBELOW',(0,0),(-1,-1),.35,colors.HexColor('#d4dde6')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
        story.append(KeepTogether([Paragraph(inline('`' + filename + '`'), styles['h2']), table, Spacer(1,8)]))
    heading = Paragraph('Functions and configuration A-Z', styles['h1']); heading.tocLevel = 0
    section_heading = heading
    letter = None
    for (filename, anchor), details in sorted(symbols.items(), key=lambda item: (symbol_name(item[0][1]).casefold(), item[0][0])):
        name = symbol_name(anchor)
        initial = name[0].upper() if name[0].isalpha() else '#'
        prefix = [section_heading] if section_heading is not None else []
        section_heading = None
        if initial != letter:
            letter = initial; heading = Paragraph(letter, styles['h2']); heading.tocLevel = 1; prefix.append(heading)
        text = inline(f'**{name}** - `{filename}` (line {details["line"]})')
        text += '<br/>' + html.escape(details['role']) + '<br/>' + task_links(details['tasks'])
        story.append(KeepTogether(prefix + [Paragraph(text, cell), Spacer(1,10)]))
    OUT.mkdir(parents=True, exist_ok=True)
    GuideDoc(target, title, data['snapshot']).multiBuild(story)
    reader = finish_pdf(target)
    print(f'PDF_READY {target} | {len(reader.pages)} pages | {len(scripts)} scripts | {len(symbols)} unique anchors', flush=True)

def build_reference(source,target):
    """Build task cards, rejecting missing source files or stale literal anchors."""
    data=json.loads(source.read_text(encoding='utf8'))
    title=data['title'];snapshot=data['snapshot'];count=0;reference_count=0
    cell=ParagraphStyle('reference-cell',parent=styles['body'],fontSize=9,leading=13,spaceAfter=0)
    label=ParagraphStyle('reference-label',parent=cell,fontName='GuideBold',textColor=TEAL)
    story=[Paragraph(inline(title),styles['title']),Paragraph('Task-to-script lookup | '+snapshot,styles['sub'])]
    for note in data['introduction']:story.append(Paragraph(inline(note),styles['body']))
    toc=TableOfContents();toc.levelStyles=[ParagraphStyle('ref-toc0',parent=styles['body'],spaceBefore=4),ParagraphStyle('ref-toc1',parent=cell,leftIndent=12,spaceBefore=2)]
    story += [Paragraph('Find a task',styles['h1']),toc,PageBreak()]
    for group in data['groups']:
        group_heading=Paragraph(inline(group['title']),styles['h1']);group_heading.tocLevel=0
        for task_index,task in enumerate(group['tasks']):
            count+=1;refs=[]
            for ref in task['refs']:
                line=checked_reference(ref)
                refs.append(f"`{ref['file']}`<br/>Find: `{ref['anchor']}`<br/>{ref['role']} (snapshot line {line})")
                reference_count+=1
            rows=[('Find in UI',task['ui']),('Code anchors','<br/><br/>'.join(refs)),('Change / preserve',task['change']),('Verify',task['check'])]
            if task.get('settings'):rows.insert(2,('Saved setting',task['settings']))
            table=Table([[Paragraph(inline(k),label),Paragraph(inline(v).replace('&lt;br/&gt;','<br/>'),cell)]for k,v in rows],colWidths=[86,419],hAlign='LEFT')
            table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(0,-1),colors.HexColor('#eef4f6')),('LINEBELOW',(0,0),(-1,-1),.35,colors.HexColor('#d4dde6')),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
            heading=Paragraph(inline(task['title']),styles['h2']);heading.tocLevel=1
            story.append(KeepTogether(([group_heading] if task_index==0 else [])+[heading,table,Spacer(1,10)]))
    story.append(PageBreak())
    heading=Paragraph('Maintaining this lookup',styles['h1']);heading.tocLevel=0;story.append(heading)
    for note in data['maintenance']:story.append(Paragraph(inline(note),styles['body']))
    OUT.mkdir(parents=True,exist_ok=True);GuideDoc(target,title,snapshot).multiBuild(story)
    reader=finish_pdf(target)
    print(f'PDF_READY {target} | {len(reader.pages)} pages | {count} tasks | {reference_count} verified source anchors',flush=True)

def build(source,target):
    if source.suffix.lower()=='.json':return build_reference(source,target)
    text=source.read_text(encoding='utf8');lines=text.splitlines();title=next((x[2:] for x in lines if x.startswith('# ')),source.stem)
    story=[Spacer(1,25),Paragraph(inline(title),styles['title']),Paragraph('Practical source and control reference<br/>29 October 2026',styles['sub']),Paragraph('Use this guide to find a feature, understand its owner, make a bounded change, and check how that change is saved. Paths are relative to C:/Dropbox/Resume Website unless stated otherwise.',styles['body']),Spacer(1,15)]
    toc=TableOfContents();toc.levelStyles=[ParagraphStyle('toc0',fontName='Guide',fontSize=10,leading=15,spaceBefore=4,textColor=NAVY),ParagraphStyle('toc1',fontName='Guide',fontSize=9,leading=13,leftIndent=14,textColor=GREY)]
    story += [Paragraph('Contents',styles['h1']),toc,PageBreak()]
    paragraph=[];code=[];in_code=False
    def flush():
        if paragraph:story.append(Paragraph(inline(' '.join(paragraph)),styles['body']));paragraph.clear()
    for line in lines:
        if line.startswith('# '):continue
        if line.startswith('```'):
            flush()
            if in_code:
                for item in code:
                    # Paragraph rather than fixed-width preformatted to wrap long paths safely.
                    story.append(Paragraph(html.escape(item) or ' ',styles['code']))
                code.clear()
            in_code=not in_code;continue
        if in_code:code.append(line);continue
        if not line.strip():flush();continue
        picture = re.fullmatch(r'!\[([^\]]+)\]\(([^)]+)\)', line.strip())
        if picture:
            flush()
            image_path = (source.parent / picture[2]).resolve()
            if not image_path.is_relative_to(ROOT.resolve()): raise ValueError('Image outside workspace')
            figure = Image(str(image_path))
            scale = min(505 / figure.drawWidth, 340 / figure.drawHeight)
            figure.drawWidth *= scale; figure.drawHeight *= scale
            caption = Paragraph(inline(picture[1]), ParagraphStyle('figure-caption',parent=styles['body'],fontSize=9,leading=12,textColor=GREY,spaceBefore=6))
            story.append(KeepTogether([figure,caption,Spacer(1,8)]))
            continue
        if line.startswith('## '):
            flush();p=Paragraph(inline(line[3:]),styles['h1']);p.tocLevel=0;story.append(p)
        elif line.startswith('### '):
            flush();p=Paragraph(inline(line[4:]),styles['h2']);p.tocLevel=1;story.append(p)
        elif re.match(r'^[-*] ',line):
            flush();story.append(Paragraph('- '+inline(line[2:]),styles['bullet']))
        elif re.match(r'^\d+\. ',line):
            flush();story.append(Paragraph(inline(line),styles['bullet']))
        else:paragraph.append(line.strip())
    flush();OUT.mkdir(parents=True,exist_ok=True)
    doc=GuideDoc(target,title);doc.multiBuild(story)
    reader=finish_pdf(target);assert len(reader.pages)>0
    assert all((page.extract_text() or '').strip() for page in reader.pages)
    assert reader.outline
    print(f'PDF_READY {target} | {len(reader.pages)} pages | {target.stat().st_size} bytes',flush=True)


def extract_settings():
    # Evaluate only the pure schema and its pure easing dependency, without loading
    # browser modules or changing the repository's CommonJS package configuration.
    script = r'''
import {readFile} from 'node:fs/promises';
const moduleUrl = text => 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const easing = moduleUrl(await readFile('_7-shared-scripts/core/transform-easing.js','utf8'));
const schemaText = await readFile('_7-shared-scripts/core/settings-schema.js','utf8');
const source = schemaText.replace("'./transform-easing.js'", JSON.stringify(easing));
const {SETTINGS_FIELDS,SCHEMA_VERSION} = await import(moduleUrl(source));
const literalCandidates=[...new Set([...schemaText.matchAll(/'([^'\r\n]*)'/g)].map(match=>match[1]))];
const fields = Object.entries(SETTINGS_FIELDS).map(([path,field]) => {
  const parser = field.parse.toString();
  const type = parser.includes('Math.max(min') ? 'number' : field.parse.name==='bool' ? 'boolean' : field.parse.name==='color' ? 'color' : parser.includes('values.includes') ? 'choice' : 'custom';
  const bounds = type==='number' ? [field.parse(-Number.MAX_VALUE),field.parse(Number.MAX_VALUE)] : null;
  let at=schemaText.indexOf("'"+path+"'");const generated=at<0;
  if(generated)at=schemaText.indexOf('export const SETTINGS_FIELDS');
  const choices=type==='choice'?literalCandidates.filter(value=>field.parse(value)!==undefined):[];
  return {path,key:field.key,default:field.default,prop:field.prop||'',legacy:field.legacy||[],type,bounds,choices,schemaLine:schemaText.slice(0,at).split('\n').length,generated};
});
console.log(JSON.stringify({schemaVersion:SCHEMA_VERSION,fields}));
'''
    result = subprocess.run(['node', '--input-type=module', '-'], input=script, text=True, encoding='utf8', cwd=ROOT, check=True, capture_output=True)
    return json.loads(result.stdout)


def settings_group(path):
    if path == 'about.centerOnViewport': return 'About framing'
    if path.startswith('about.'):
        return {'about':'Fish visibility', 'skills':'Skills visibility', 'notes':'Notes', 'clock':'Clock', 'refs':'Refs visibility', 'odd':'Oddio', 'spheroid':'Skills spheroid'}[path.split('.')[1]]
    return {'audio':'Audio', 'accessibility':'Accessibility', 'header':'Header', 'interaction':'Interaction and motion', 'scene':'Scene lighting', 'start':'Start appearance', 'media':'Video preferences', 'cube':'Cube', 'music':'Music', 'graphics':'Graphics', 'games':'Games', 'videos':'Videos', 'docs':'Docs'}[path.split('.')[0]]


SETTINGS_ROUTES = {
    'Audio': ('General -> Audio', ['debug/panel-shell.js', '_7-shared-scripts/audio-settings.js']),
    'Accessibility': ('General -> Accessibility; effective motion also follows OS preferences', ['debug/panel-shell.js', '_7-shared-scripts/core/motion-preference.js']),
    'Header': ('General -> Header', ['debug/panel-shell.js', '_7-shared-scripts/core/header.js']),
    'Interaction and motion': ('General -> Focused media / Transform resets / Points of interest', ['debug/settings-focused-media.js', 'debug/settings-reset-easing.js', 'debug/settings-poi.js']),
    'Scene lighting': ('General -> Scene appearance; Start also has lighting/visual controls', ['debug/panel-shell.js']),
    'Start appearance': ('Start native/3D controls and its page settings; not every schema field has a visible control', ['_0-start/start-page.js', 'debug/panel-shell.js']),
    'Video preferences': ('Videos page settings; exposed shared-player controls depend on the adapter', ['debug/panel-shell.js', '_2-videos/videos.js']),
    'About framing': ('About framing preference and host viewport behavior', ['_1-about/about.js', 'debug/panel-shell.js']),
    'Cube': ('About -> Cube tab', ['_1-about/faces/backing-controls.js', '_1-about/about.js']),
    'Fish visibility': ('About -> Cube or pinned Fish visibility/backing controls; frame/gallery preferences have private owners', ['_1-about/faces/backing-controls.js', '_1-about/faces/about/fish-face.js']),
    'Skills visibility': ('About -> Cube or pinned Skills visibility/backing controls; beanbag/panel settings have additional owners', ['_1-about/faces/backing-controls.js', '_1-about/faces/skills/face.js']),
    'Refs visibility': ('About -> Cube or pinned Refs visibility/backing controls; cabinet/editor settings have private owners', ['_1-about/faces/backing-controls.js', '_1-about/faces/refs/controls.js']),
    'Notes': ('About -> Notes ordinary/Constructor controls and pinned visibility; editable drawings are separate', ['_1-about/notes/notes-face.js', '_1-about/faces/backing-controls.js']),
    'Oddio': ('About -> Oddio Settings and Constructor; data-pref controls bind to about.odd fields', ['_1-about/faces/odd/oddio-settings.js', '_1-about/faces/odd/addon-layout-editor.js']),
    'Clock': ('About -> Clock; hand, groove and gear sections depend on the loaded clock variant', ['_1-about/faces/clock/controls.js', '_1-about/faces/clock/face.js']),
    'Skills spheroid': ('About -> Skill/Skills -> Lattice -> Spheroid lattice, when that host section is present', ['_1-about/faces/backing-controls.js', '_1-about/faces/interior-drive.js']),
    'Music': ('Music settings -> Music / Music screen / Track icons; instrument and track content have separate owners', ['debug/panel-shell.js', '_5-music/music-piano-controls.v2.js']),
    'Graphics': ('Graphics settings -> viewport, shelf/video navigation and page surface controls', ['debug/panel-shell.js', '_3-graphics/shelf/graphics-preview.mjs']),
    'Games': ('Games settings -> Center on viewport', ['debug/panel-shell.js', '_4-games/games.js']),
    'Videos': ('Videos settings and page-specific explainer controls', ['debug/panel-shell.js', '_2-videos/videos.js']),
    'Docs': ('Docs settings -> Center on viewport; document content is in Constructor', ['debug/panel-shell.js', '_6-docs/docs-3d.js']),
}

PRIVATE_CONTROL_OWNERS = [
    ('Fish frame and hover controls', '_1-about/faces/about/fish-face.js',
     'Constructor -> Fish; normalizeFrameOptions/setFrameOptions and normalizeHoverSettings/setHoverOptions own these values. Private keys include site.about.fish.frame.v1 and site.about.fish.rings.v1; ordinary audio response uses site.about.fish.v1. Read their normalizers/defaults before changing ranges. These are separate from the central Fish visibility fields.'),
    ('Fish imported pictures', '_1-about/faces/about/picture-library.mjs',
     'createPictureLibrary owns local metadata at site.about.picture-library.v2 and original image blobs in the site-about-picture-assets-v1 IndexedDB database. Caption overrides and prepared display images differ from originals. A preference backup alone may not contain the image blobs.'),
    ('Refs cabinet and layout options', '_1-about/faces/refs/controls.js',
     'Constructor registration and createRefsControls own the detailed fields. The archive owner is about.refs.sketch; board.getOptions/apply and normalizeRefsOptions in snap-board.js define the content/validation boundary. The local fields list covers scale, width, height, placement, rotation, shoulder/opening/bay sizes, line weight and opacity. Original pictures have their own picture-source.js storage.'),
    ('Skills panel and visual configuration', '_7-shared-scripts/panel-assembly/SkillsSettings.mjs',
     'mountSkillsSettings registers archive owner about.skills. The fields inventory groups Filaments, Color, Bursts, Particles, Cards and Structure/Frame; presets and the source read/apply bundle own additional settings. SkillsBaseline.mjs supplies the captured baseline. Central visibility preferences are not the complete panel configuration.'),
    ('Oddio audio sessions', '_1-about/faces/odd/session-io.mjs',
     'sessionObject/unpackSession define editable sessions, currently format Oddio version 4, including sources/clips/lanes and session state. SAVE SESSION / OPEN SESSION in the accessible deck operate on this content. Physical panel preferences are mostly central schema fields; saving those is not an audio-session backup.'),
    ('Notes editable drawings and library', '_1-about/notes/drawing-library.js',
     'createDrawingLibrary, validateDrawing and parseDrawingFile own editable content. Current databases are site.about.notes.library and site.about.notes.working. Editable format notes-drawing differs from a raster export and from shared preferences. Preserve document/layer/anchor data when changing formats.'),
    ('Sticky-note drafts and published bundles', '_7-shared-scripts/sticky-notes/index.js',
     'General Constructor -> Sticky notes is the authoring entry. Shared index/data modules separate drafts, bundle validation and visitor read history; published content is assets/annotations/sticky-notes.json. Import/export the actual note bundle and preserve scene anchors rather than treating it as an ordinary scalar preference.'),
    ('Docs collection and uploaded originals', '_6-docs/library/editor.js',
     'Constructor -> Docs uses browser draft docs-library-draft-v1, Save document, Save to project and metadata JSON transfer. documents.json is the project manifest; original files and generated covers/pages are separate assets. validateLibrary in library/schema.js governs allowed content. Back up the referenced files as well as the manifest.'),
]


def build_settings(target):
    data = extract_settings()
    data['privateOwners'] = [{'name':name,'source':owner,'notes':notes} for name,owner,notes in PRIVATE_CONTROL_OWNERS]
    source = ROOT / 'docs/user-guide/10-settings-field-reference.json'
    for field in data['fields']:
        field['group'] = settings_group(field['path'])
        field['ui'], field['owners'] = SETTINGS_ROUTES[field['group']]
        for owner in field['owners']:
            if not (ROOT / owner).is_file(): raise ValueError('Missing settings owner: ' + owner)
    source.write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n', encoding='utf8')
    csv_path = source.with_suffix('.csv')
    columns = ['path','group','ui','default','type','bounds','choices','key','prop','legacy','schemaLine','generated','owners']
    with csv_path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns); writer.writeheader()
        for field in data['fields']:
            writer.writerow({key: json.dumps(field[key], ensure_ascii=False) if isinstance(field[key], (dict,list,bool)) or field[key] is None else field[key] for key in columns})
    title = 'Chapter 10 - Settings field reference'
    story = [Paragraph(title,styles['title']), Paragraph('Central schema catalog | 29 October 2026',styles['sub'])]
    for note in [
        f'This catalog contains all {len(data["fields"])} fields currently declared in the central SETTINGS_FIELDS schema (version {data["schemaVersion"]}). It is generated from the schema, not manually copied. Paths are relative to C:/Dropbox/Resume Website/.',
        'Look up a visible feature by section, or search the exact setting path. Each row gives the source default, validation category/range, storage key and schema location. A default is not the value currently saved in your browser.',
        'UI routes and owners identify where to start tracing a control. They do not prove that every schema field is exposed, that a private face owner uses no additional settings, or that each consumer has passed acceptance. Generated definitions point to the SETTINGS_FIELDS object; search its templates/loops for the field suffix.',
        'Numeric ranges below are the central parser clamp bounds. DOM sliders can expose narrower ranges or steps. Listed choice values were checked against the parser using schema string literals; custom formats/easing validators still require source inspection. Reduced motion default null follows the effective preference logic; it is not the same as false.',
        'Private content is separate: drawings/libraries, Refs layouts/original pictures, Fish imported imagery, Oddio audio sessions, soundfont packages, sticky-note bundles and Docs manifests/files need their own save/export workflows. Do not clear all local storage to restore one preference.',
    ]: story.append(Paragraph(note,styles['body']))
    toc=TableOfContents();toc.levelStyles=[ParagraphStyle('settings-toc',parent=styles['body'],spaceBefore=3)]
    story += [Paragraph('Setting groups',styles['h1']),toc,PageBreak()]
    cell=ParagraphStyle('settings-cell',parent=styles['body'],fontSize=9,leading=13,spaceAfter=0)
    for group,(route,owners) in SETTINGS_ROUTES.items():
        fields=[field for field in data['fields'] if field['group']==group]
        if not fields: continue
        heading=Paragraph(group,styles['h1']);heading.tocLevel=0
        context=Paragraph(inline(route+'. Owners: '+', '.join('`'+owner+'`'for owner in owners)),cell)
        rows=[]
        for field in sorted(fields,key=lambda item:item['path'].casefold()):
            value=json.dumps(field['default'],ensure_ascii=False)
            if len(value)>160:value=value[:157]+'...'
            left=inline('**'+field['path']+'**')+'<br/>'+inline('Default: `'+value+'`')
            validation=field['type']
            if field['bounds']:validation+='; clamp '+str(field['bounds'][0])+' to '+str(field['bounds'][1])
            right=inline('Validation: '+validation)+'<br/>'+inline('Storage: `'+field['key']+'`')
            if field['choices']:right+='<br/>'+inline('Options: '+', '.join('`'+value+'`'for value in field['choices']))
            if field['prop']:right+='<br/>'+inline('Object property: `'+field['prop']+'`')
            if field['legacy']:right+='<br/>'+inline('Legacy: '+', '.join('`'+x+'`'for x in field['legacy']))
            right+='<br/>'+inline('Schema line '+str(field['schemaLine'])+(' (generated definition)'if field['generated']else''))
            rows.append([Paragraph(left,cell),Paragraph(right,cell)])
        def make_table(values):
            table=Table(values,colWidths=[215,290],hAlign='LEFT')
            table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(0,-1),colors.HexColor('#eef4f6')),('LINEBELOW',(0,0),(-1,-1),.35,colors.HexColor('#d4dde6')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
            return table
        story.append(KeepTogether([heading,context,Spacer(1,8),make_table(rows[:1])]))
        if len(rows)>1:story.append(make_table(rows[1:]))
        story.append(Spacer(1,8))
    story.append(PageBreak())
    heading=Paragraph('Controls and content outside the central schema',styles['h1']);heading.tocLevel=0;story.append(heading)
    story.append(Paragraph('Use this owner map when a face has many controls but only visibility fields appear in the catalog. These notes are source-checked entry points; the list does not claim every private property or export payload has been exercised in a browser.',styles['body']))
    for name,owner,notes in PRIVATE_CONTROL_OWNERS:
        if not (ROOT/owner).is_file():raise ValueError('Missing private owner: '+owner)
        heading=Paragraph(name,styles['h2']);heading.tocLevel=1
        story.append(KeepTogether([heading,Paragraph(inline('`'+owner+'`'),cell),Spacer(1,5),Paragraph(inline(notes),cell),Spacer(1,9)]))
    OUT.mkdir(parents=True,exist_ok=True);GuideDoc(target,title).multiBuild(story)
    reader=finish_pdf(target)
    print(f'PDF_READY {target} | {len(reader.pages)} pages | {len(data["fields"])} settings | JSON and CSV saved',flush=True)

if __name__=='__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', nargs='?')
    parser.add_argument('--output')
    parser.add_argument('--all', action='store_true', help='Build the complete linked set and validate all remote destinations')
    parser.add_argument('--index', action='store_true', help='Build the derived alphabetical index after Chapter 8')
    parser.add_argument('--settings', action='store_true', help='Extract the central schema and build Chapter 10 plus JSON/CSV')
    args = parser.parse_args()
    if args.all:
        for stem, _ in GUIDES[:9]:
            suffix = '.json' if stem.startswith('08-') else '.md'
            build(ROOT / 'docs/user-guide' / (stem + suffix), OUT / (stem + '.pdf'))
        build_index(REFERENCE_SOURCE, OUT / (GUIDES[9][0] + '.pdf'))
        build_settings(OUT / (GUIDES[10][0] + '.pdf'))
        build(ROOT / 'docs/user-guide/11-asset-source-reference.md', OUT / (GUIDES[11][0] + '.pdf'))
        validate_links(OUT)
        package_guides(OUT)
    elif args.index:
        build_index(REFERENCE_SOURCE, OUT / (GUIDES[9][0] + '.pdf'))
    elif args.settings:
        build_settings(OUT / (GUIDES[10][0] + '.pdf'))
    elif args.source:
        source = ROOT / args.source
        target = ROOT / args.output if args.output else OUT / (source.stem + '.pdf')
        build(source, target)
    else:
        parser.error('Supply a chapter source, --index or --all')
