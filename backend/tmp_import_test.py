import sys, os
sys.path.append(os.path.abspath('D:/Takees/Teakeesestate/backend'))
try:
    import app.main
    print('import success')
except Exception as e:
    print('import error:', e)
