/**
 * Auto-generated Encrypted Secret Configurations (4 Keys)
 * Encrypted using PBKDF2 (SHA-256, 10,000 iter) + AES-CBC (256-bit) + HMAC-SHA256.
 */
const ENCRYPTED_SECRET_CONFIGS = [
  {
    "id": 1,
    "salt": "dad773281644248d56ee50f3c243da8f",
    "iv": "ef45315580081f0b962c5f15031f05a0",
    "ciphertext": "acb6be46f5760eb8f10f48e74a648ae87069b202506f9352081dbea46f3a739984c6ffeb573146ff9eef6908f20b0aed",
    "hmac": "e89ef8c11c76ad1fa66abc8c26024ed4ce0617cbaa4ed1603dc14165c11ad487",
    "algorithm": "AES-CBC",
    "iterations": 10000
  },
  {
    "id": 2,
    "salt": "c3282a07916f7408f2a6d7cd110f3b41",
    "iv": "913e76eed555d07219e9f427603fad43",
    "ciphertext": "39dbb855dd5b4981cb4b9d713eaea2861734842afed395bed8c9952945f4784a1599765ed5658b2add45f1fc2a45948a6c11057e22b9d4652d5f9c3f3f3ea21a",
    "hmac": "a27bfa519d1c80a47cae516e007f508c939a5ecf16155bb3d0ab3868f015b283",
    "algorithm": "AES-CBC",
    "iterations": 10000
  },
  {
    "id": 3,
    "salt": "41c66e3c2cabfd1a09dd71de84da923c",
    "iv": "8e4b5c6ba95327750feece70dcabb5f5",
    "ciphertext": "a2b7913e9bab50d411729a6eedaee04a26b55fada0ae26869e5a3ea6fc6558dbe9f2a6091d1efabedf752a182bcc8a5bab162ee00cc8a747ddd381310fc22925",
    "hmac": "fd0a36d3b79dc9444db3e8dffeb4ecbda99310e9e42568286e84f54967c7c8ba",
    "algorithm": "AES-CBC",
    "iterations": 10000
  },
  {
    "id": 4,
    "salt": "71b6b4e15179b1b6db051e7b10e161dc",
    "iv": "05314422039b88f8cd91338de3dbd010",
    "ciphertext": "ac08c34da3ea7b5f025b93a26d395011d5fcd1a1cf2ce57029352f090e40ea0ee8ed139a615fa64929e05d0dc30ab0af331c790a38914d61f70abaf3a19d0fa7",
    "hmac": "3e287721e9b428b9a2032e4d25ac8d8cae2cfb6867c4d4237c1176419b3682a7",
    "algorithm": "AES-CBC",
    "iterations": 10000
  }
];

// Backward compatibility alias (first key)
const ENCRYPTED_SECRET_CONFIG = ENCRYPTED_SECRET_CONFIGS[0];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENCRYPTED_SECRET_CONFIGS, ENCRYPTED_SECRET_CONFIG };
}
