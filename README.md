# Officina 1907 — Laboratorio

Simulatore giocabile del prototipo Officina 1907: plancia a stella, carte illustrate, tre reparti produttivi, tensione, welfare, repressione e commesse. Include editor e simulazioni con IA.

## Giocare senza installare nulla

**[Apri il simulatore online](https://monga-hub.github.io/officina/)**, anche dal telefono e con il computer spento.

Scarica [lab.html pronto all’uso](https://github.com/monga-hub/officina/raw/refs/heads/main/dist-lab/lab.html) e aprilo nel browser. È un file unico: immagini, interfaccia e motore sono incorporati.

La partita si salva automaticamente dopo ogni mossa. Alla riapertura premi **Riprendi partita**. Il salvataggio comprende scelte in sospeso, impostazioni, pausa IA e le ultime 10 mosse annullabili. Resta nel browser utilizzato: non viene caricato su GitHub e non si trasferisce automaticamente ad altri dispositivi. Per i file locali la persistenza dipende dal browser; mantieni lo stesso file e percorso. L’avvio locale qui sotto offre un indirizzo stabile.

Sul telefono il tavolo si ridimensiona per mostrare insieme fabbrica, stella e commesse. La vista usa automaticamente lo spazio disponibile, senza barre di zoom aggiuntive. Puoi ruotare lo schermo o usare lo zoom del browser. Carte e finestre delle azioni si aprono a dimensione normale.

Il tavolo usa cerchi dorati per i marchi e quadrati verde chiaro per i PV, con il numero all’interno. Le risorse restano quadrati rossi, blu e gialli. Operaio, ingranaggio e freccia indicano sviluppo, macchinario e conversione: la legenda **Simboli** è disponibile sotto il tavolo.

## Avvio locale dai sorgenti

Richiede Node.js 22 e npm.

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Apri **http://127.0.0.1:5199/lab.html**. Se la porta è occupata, usa l’indirizzo indicato dal server aggiungendo `/lab.html`.

Il Laboratorio aggiornato è `lab.html`; `/` conserva l’interfaccia storica per compatibilità. Gli impiegati sono esclusi dal nuovo Laboratorio. In Città si consegna una sola commessa per visita, con conclusione automatica del turno; non si acquistano carte.

## Verificare e compilare

```sh
npm run check:lab
npm run build:lab
```

La compilazione aggiorna **dist-lab/lab.html**, incluso nel repository per poterlo scaricare direttamente. Dopo modifiche al codice, ricompilalo prima di caricare l’aggiornamento.

I controlli coprono configurazione, partite complete, azioni legali, commesse, conversioni e ripristino dei salvataggi. Gli studi storici opzionali richiedono i relativi report locali, non inclusi nel repository.

## Pubblicazione online

Ogni aggiornamento del ramo `main` avvia i controlli e la compilazione del Laboratorio. Se riescono, GitHub Actions pubblica automaticamente il risultato su GitHub Pages. La pagina iniziale online apre il Laboratorio, mentre l’interfaccia storica resta disponibile nei sorgenti locali.

I salvataggi online restano nel browser del dispositivo: non sono condivisi con localhost, con il file scaricato o con altri dispositivi.

## Contenuto

- `src/lab/`: tavolo giocabile, editor, simulazioni, immagini e salvataggio automatico.
- `src/game/`: motore delle regole e IA condivisi.
- `src/components/`: componenti condivisi e interfaccia storica.
- `scripts/`: controlli e strumenti di simulazione.
- `dist-lab/lab.html`: versione compilata autonoma.

Le regole sono in sviluppo. I risultati dell’IA aiutano a confrontare configurazioni; non sostituiscono le prove con giocatori.
