# 🕵️ Code Undercover

> Un jeu de déduction en temps réel — trouvez l'imposteur avant qu'il ne soit trop tard.

---

## 🎮 À propos du jeu

**Code Undercover** est un jeu multijoueur en ligne inspiré du jeu de société *Undercover*. Les joueurs rejoignent une room, reçoivent un mot secret, et tentent de découvrir qui parmi eux est l'imposteur — sans révéler leur propre mot.

- 👥 Multijoueur temps réel via WebSocket
- 🔑 Rooms privées avec code unique
- 🧠 Déduction, bluff et stratégie
- ⚡ Parties rapides (5–15 min)

---

## 🏗️ Architecture

```
Client (React / Mobile)
       │
       ▼
  REST API (NestJS)
       │
  ┌────┴────┐
  │         │
  DB      WebSocket Gateway
(PostgreSQL)  (Socket.IO)
```

---

## 🚀 Getting Started

### Prérequis

- Node.js ≥ 18
- PostgreSQL ≥ 14
- npm ou yarn

### Installation

```bash
git clone https://github.com/your-org/code-undercover.git
cd code-undercover
npm install
```

### Variables d'environnement

```env
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/undercover
JWT_SECRET=your_jwt_secret_here
PORT=3000
```

### Lancer le projet

```bash
# Développement
npm run start:dev

# Production
npm run build
npm run start:prod
```

---

## 🏠 Workflow — Création de Room

Voici le flow complet déclenché lors de la création d'une room.

```
[Request: POST /rooms]
         │
         ▼
  [Validate JWT]
         │
         ▼
  [Generate Room Code]   →  ex: X7K9P
         │
         ▼
  [Create Room in DB]    →  status: "WAITING"
         │
         ▼
  [Create Host Player]   →  is_host: true
         │
         ▼
  [Join WebSocket Room]  →  channel: room:<CODE>
         │
         ▼
  [Emit: room_created]
         │
         ▼
  [Return API Response]
```

### 1 · Authentification

Chaque requête doit porter un JWT valide. Le backend vérifie le token et résout l'utilisateur associé. Sans JWT valide → `401 Unauthorized`.

### 2 · Génération du code

Le code de room est composé de **5 à 6 caractères** (majuscules + chiffres), généré aléatoirement avec retry automatique en cas de collision.

```
X7K9P  /  AB3Z2  /  R8MP6
```

### 3 · Structures de données

**Room**
```ts
{
  id:          UUID
  code:        string       // ex: "X7K9P"
  host_id:     string
  status:      "WAITING"    // WAITING | IN_PROGRESS | FINISHED
  max_players: number
  created_at:  timestamp
}
```

**Player (Host)**
```ts
{
  id:       UUID
  user_id:  string
  room_id:  string
  is_host:  true
}
```

### 4 · WebSocket

À la création, le host est automatiquement inscrit dans le channel WebSocket de la room :

```
room:<ROOM_CODE>
```

L'événement émis au client :

```ts
// Événement: room_created
{
  roomId:  string,
  code:    string,
  players: [{ userId: string, isHost: true }]
}
```

### 5 · Réponse API

```ts
// POST /rooms → 201 Created
{
  roomId: string,
  code:   string,
  status: "WAITING"
}
```

---

## ⚠️ Edge Cases

| Cas | Comportement |
|---|---|
| Code déjà existant | Régénération automatique (retry) |
| User déjà dans une room | Refus ou sortie forcée de l'ancienne |
| Trop de rooms actives | Rate limiting sur l'endpoint |
| JWT expiré | `401 Unauthorized` immédiat |
| Room pleine | `403 Forbidden` à la tentative de join |

---

## 🔒 Sécurité

- Validation JWT sur toutes les routes protégées
- Pas de duplication de joueur dans une même room
- Vérification `max_players` côté serveur (jamais côté client)
- Rate limiting sur la création de rooms

---

## 📁 Structure du projet

```
src/
├── auth/               # JWT strategy, guards
├── rooms/
│   ├── rooms.module.ts
│   ├── rooms.controller.ts
│   ├── rooms.service.ts    # logique métier
│   └── rooms.gateway.ts    # WebSocket
├── players/
│   └── players.service.ts
└── app.module.ts
```

---

## 🧠 Principes de développement

- **Backend = source de vérité** — toute logique critique vit côté serveur
- **Séparation des responsabilités** — Controller / Service / Gateway distincts
- **Toujours valider côté serveur** — ne jamais faire confiance au client

---

## 📜 Licence

MIT — voir [LICENSE](./LICENSE)
