from PIL import Image, ImageDraw, ImageFont
f=ImageFont.truetype('/usr/share/fonts/opentype/unifont/unifont.otf',16)
def bm(ch):
    im=Image.new('1',(24,16),0); d=ImageDraw.Draw(im); d.text((8,0),ch,font=f,fill=1)
    return [[im.getpixel((x,y)) for x in range(24)] for y in range(16)]
