import json

with open('server/licensing/tsconfig.json', 'r') as f:
    data = json.load(f)

data['compilerOptions']['rootDir'] = '../../'

with open('server/licensing/tsconfig.json', 'w') as f:
    json.dump(data, f, indent=2)

print('Fixed tsconfig')
