import os
import re

old_signer = 'src/shared/crypto/ServerAuthorizationSigner.ts'
new_signer = 'server/licensing/src/crypto/ServerAuthorizationSigner.ts'

with open(old_signer, 'r') as f:
    content = f.read()

# Remove the interfaces
content = re.sub(r'export interface AuthorizationPayload[\s\S]*?signingKeyId: string;\n}\n', '', content)
content = re.sub(r'export type SignedAuthorization[\s\S]*?encoded\n};\n', '', content)

content = "import { AuthorizationPayload, SignedAuthorization } from '../../../../src/shared/crypto/AuthorizationPayload';\n" + content

with open(new_signer, 'w') as f:
    f.write(content)

os.remove(old_signer)

type_reps = [
  ('src/infrastructure/licensing/LocalAuthorizationStore.ts', "from '../../shared/crypto/ServerAuthorizationSigner'", "from '../../shared/crypto/AuthorizationPayload'"),
  ('src/application/use-cases/LicensingService.ts', "from '../../shared/crypto/ServerAuthorizationSigner'", "from '../../shared/crypto/AuthorizationPayload'"),
  ('src/application/interfaces/ILocalAuthorizationStore.ts', "from '../../shared/crypto/ServerAuthorizationSigner'", "from '../../shared/crypto/AuthorizationPayload'"),
  ('src/shared/crypto/AuthorizationVerifier.ts', "from './ServerAuthorizationSigner'", "from './AuthorizationPayload'"),
  ('electron/licensing/LicensingClient.ts', "from '../../src/shared/crypto/ServerAuthorizationSigner'", "from '../../src/shared/crypto/AuthorizationPayload'"),
  ('electron/licensing/LicensingRuntimeService.ts', "from '../../src/shared/crypto/ServerAuthorizationSigner'", "from '../../src/shared/crypto/AuthorizationPayload'"),
  ('server/licensing/src/crypto/SigningKeyProvider.ts', "from '../../../../src/shared/crypto/ServerAuthorizationSigner'", "from '../../../../src/shared/crypto/AuthorizationPayload'")
]

for fp, fr, to in type_reps:
    with open(fp, 'r') as f:
        c = f.read()
    c = c.replace(fr, to)
    with open(fp, 'w') as f:
        f.write(c)

class_reps = [
  ('server/licensing/src/routes/activation.ts', 
   "import { ServerAuthorizationSigner } from '../../../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../crypto/ServerAuthorizationSigner'"),
  ('server/licensing/src/services/ActivationService.ts', 
   "import { ServerAuthorizationSigner, SignedAuthorization } from '../../../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../crypto/ServerAuthorizationSigner';\nimport { SignedAuthorization } from '../../../../src/shared/crypto/AuthorizationPayload'"),
  ('tests/licensing/activation-integration.test.ts', 
   "import { ServerAuthorizationSigner, SignedAuthorization } from '../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../../server/licensing/src/crypto/ServerAuthorizationSigner';\nimport { SignedAuthorization } from '../../src/shared/crypto/AuthorizationPayload'"),
  ('tests/licensing/local-store.test.ts', 
   "import { ServerAuthorizationSigner, AuthorizationPayload, SignedAuthorization } from '../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../../server/licensing/src/crypto/ServerAuthorizationSigner';\nimport { AuthorizationPayload, SignedAuthorization } from '../../src/shared/crypto/AuthorizationPayload'"),
  ('tests/licensing/runtime-authority.test.ts', 
   "import { ServerAuthorizationSigner, AuthorizationPayload } from '../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../../server/licensing/src/crypto/ServerAuthorizationSigner';\nimport { AuthorizationPayload } from '../../src/shared/crypto/AuthorizationPayload'"),
  ('server/licensing/tests/activation.concurrency.test.ts', 
   "import { ServerAuthorizationSigner } from '../../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../src/crypto/ServerAuthorizationSigner'"),
  ('server/licensing/tests/crypto.test.ts', 
   "import { ServerAuthorizationSigner, AuthorizationPayload } from '../../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../src/crypto/ServerAuthorizationSigner';\nimport { AuthorizationPayload } from '../../../src/shared/crypto/AuthorizationPayload'"),
  ('server/licensing/tests/phase12.security.test.ts', 
   "import { ServerAuthorizationSigner, AuthorizationPayload } from '../../../src/shared/crypto/ServerAuthorizationSigner'", 
   "import { ServerAuthorizationSigner } from '../src/crypto/ServerAuthorizationSigner';\nimport { AuthorizationPayload } from '../../../src/shared/crypto/AuthorizationPayload'")
]

for fp, fr, to in class_reps:
    with open(fp, 'r') as f:
        c = f.read()
    c = c.replace(fr, to)
    with open(fp, 'w') as f:
        f.write(c)

print('Fixed all')
