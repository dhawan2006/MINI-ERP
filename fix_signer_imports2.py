import re

fp = 'server/licensing/src/crypto/ServerAuthorizationSigner.ts'
with open(fp, 'r') as f:
    c = f.read()

c = c.replace("from './canonicalize'", "from '../../../../src/shared/crypto/canonicalize'")
c = c.replace("from './cryptoError'", "from '../../../../src/shared/crypto/cryptoError'")

with open(fp, 'w') as f:
    f.write(c)

print('Fixed')
