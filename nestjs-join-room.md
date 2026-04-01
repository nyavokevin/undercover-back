# 🔗 Join Room — Backend Workflow (Code Undercover)

## 📌 Overview

Ce document décrit le workflow backend permettant à un utilisateur de rejoindre une room existante.

Objectif :
- Vérifier la validité de la room
- Ajouter le joueur
- Synchroniser en temps réel
- Mettre à jour le lobby

---

## ⚡ Flow Global


Client → Backend → DB → WebSocket → Broadcast

[Request: Join Room]
↓
[Validate User]
↓
[Find Room by Code]
↓
[Validate Room State]
↓
[Create Player]
↓
[Join WebSocket Room]
↓
[Broadcast Room Update]
↓
[Return Response]


---

## 🔐 1. Authentication

Le backend vérifie :
- JWT valide
- utilisateur existant

❌ Si invalide → reject request

---

## 🔍 2. Find Room

Recherche par code :


room = findRoomByCode(code)


❌ Si non trouvé → return error "ROOM_NOT_FOUND"

---

## ⚠️ 3. Validate Room

Vérifier :

- room.status === "WAITING"
- nombre de joueurs < max_players
- game non démarrée

❌ Sinon :
- "ROOM_FULL"
- "GAME_ALREADY_STARTED"

---

## 👤 4. Create Player

Ajouter le joueur :


Player {
id: UUID
user_id: string
room_id: string
is_host: false
}


---

## 🔁 5. Prevent Duplicate Join

Vérifier :
- user déjà dans la room ?

✔️ Si oui → return existing player  
❌ Sinon → créer nouveau

---

## 🔌 6. WebSocket Join

Ajouter le socket à la room :


room:<ROOM_CODE>


Permet :
- broadcast ciblé
- sync en temps réel

---

## 📡 7. Broadcast Update

Envoyer à tous les joueurs :


room_updated {
players: [
{ userId, isHost }
]
}


---

## 📤 8. Response

Retour API :


{
roomId: string,
code: string,
players: []
}


---

## ⚠️ Edge Cases

### ❌ Room not found
→ code invalide

### ❌ Room full
→ max players atteint

### ❌ Game started
→ impossible de rejoindre

### ❌ Duplicate user
→ ne pas recréer

---

## 🔒 Security

- validation JWT obligatoire
- vérifier droits utilisateur
- éviter multi-connexion abusive

---

## 🧠 Best Practices

- Backend = source de vérité
- Toujours valider avant insertion
- Synchroniser via WebSocket après chaque action

---

## 🏁 Summary

Rejoindre une room :

1. Authentifier user
2. Trouver room via code
3. Vérifier disponibilité
4. Ajouter player
5. Rejoindre WebSocket room
6. Broadcast update
7. Retourner données

---