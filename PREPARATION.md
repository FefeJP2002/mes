# Fiches préparées au bureau (`bureau.json`)

Les fiches listées dans `bureau.json` arrivent automatiquement sur le téléphone de chaque
metteur au point, dès qu'il ouvre l'appli avec du réseau. Les valeurs préparées s'affichent
en **jaune** (valeurs théoriques à respecter) et il ne reste qu'à saisir les mesures.

## Format

```json
{
  "chantiers": [
    { "code": "T26-CH0104", "nom": "ROVERAY 14", "adresse": "Ch. du Roveray 14, 1208 Genève" }
  ],
  "fiches": [
    {
      "ref": "roveray-vannes-sous-sol",
      "chantier": "T26-CH0104",
      "type": "vanne-equilibrage",
      "titre": "Vannes sous-sol",
      "lignes": [
        { "N° de la vanne": "V1", "Débit théorique": "850", "DN": "20", "Réglage": "3.5" },
        { "N° de la vanne": "V2", "Débit théorique": "420", "DN": "15" }
      ]
    },
    {
      "ref": "roveray-p1",
      "chantier": "T26-CH0104",
      "type": "circulateurs",
      "titre": "Circulateur P1 chauffage",
      "valeurs": { "N° du circulateur": "P1", "Fluide": "Eau", "Débit d’eau théorique": "2.4" },
      "lignes": { "Marque": ["Grundfos"], "Type": ["Magna3 32-80"], "Puissance (W)": ["180"] }
    }
  ]
}
```

- `ref` : identifiant unique et stable de la fiche préparée (ne pas le changer, sinon une nouvelle fiche est créée).
- `chantier` : n° de dossier. Un chantier absent du téléphone y est ajouté (avec `nom` et `adresse` de la liste `chantiers`).
- `type` : `id` du modèle dans `fiches.json` (ex. `circulateurs`, `vanne-equilibrage`, `vase`, `echangeurs`,
  `equilibrage-collecteurs`, `filtre`, `solaire`, `ventil-debit`, `ventil-bouche`, `ventil-reglage`…).
- `valeurs` : champs simples, par libellé (le début du libellé suffit, accents et majuscules ignorés).
- `lignes` :
  - tableaux à lignes fixes (circulateurs, vase, ventilateurs, échangeurs) : `{ "Libellé de ligne": [colonne 1, colonne 2] }`
    ou `{ "Libellé de ligne": { "Libellé de colonne": valeur } }` — on ne remplit en général que la colonne théorique / constructeur ;
  - tableaux libres (vannes, collecteurs, filtres, solaire, mise en eau) : liste d'objets `{ "Libellé de colonne": valeur }`.
    S'il y a plus de lignes que la fiche papier n'en contient, l'appli crée automatiquement plusieurs fiches (1/2, 2/2…).

## Mise à jour

Modifier une valeur dans `bureau.json` met à jour la fiche sur les téléphones, sauf si le metteur au point a déjà
changé cette case lui-même. Une fiche préparée supprimée sur un téléphone ne revient pas.
