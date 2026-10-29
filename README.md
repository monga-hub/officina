# Officina 1907 — Laboratorio

Simulatore giocabile del prototipo Officina 1907: plancia a stella, carte illustrate, tre reparti produttivi, tensione, welfare, repressione e commesse. Include editor e simulazioni con IA.

## Giocare senza installare nulla

**[Apri il simulatore online](https://monga-hub.github.io/officina/)**, anche dal telefono e con il computer spento.

Scarica [lab.html pronto all’uso](https://github.com/monga-hub/officina/raw/refs/heads/main/dist-lab/lab.html) e aprilo nel browser. È un file unico: immagini, interfaccia e motore sono incorporati.

La partita si salva automaticamente dopo ogni mossa. Alla riapertura premi **Riprendi partita**. Il salvataggio comprende scelte in sospeso, impostazioni, pausa IA e le ultime 10 mosse annullabili. Resta nel browser utilizzato: non viene caricato su GitHub e non si trasferisce automaticamente ad altri dispositivi. Per i file locali la persistenza dipende dal browser; mantieni lo stesso file e percorso. L’avvio locale qui sotto offre un indirizzo stabile.

Sul telefono il tavolo si ridimensiona per mostrare insieme fabbrica, stella e commesse. La vista usa automaticamente lo spazio disponibile, senza barre di zoom aggiuntive. Puoi ruotare lo schermo o usare lo zoom del browser. Carte e finestre delle azioni si aprono a dimensione normale.

Il tavolo usa cerchi dorati per i marchi e quadrati verde chiaro per i PV, con il numero all’interno. Le risorse restano quadrati rossi, blu e gialli. Operaio, ingranaggio e freccia indicano sviluppo, macchinario e conversione: la legenda **Simboli** è disponibile sotto il tavolo.

## Ultima versione testata · 29 ottobre 2026

In **Gioca**, premi **Gioca l’ultima versione testata** per caricare e avviare le regole delle ultime cinque prove, anche se nel browser hai ancora altre impostazioni. Usa il numero di giocatori umani e la velocità IA selezionati nella stessa schermata. Le partite già salvate conservano le proprie regole.

- **3 giocatori, 28 turni, cinque righe da quattro caselle**, sviluppo fino a20. Il rendimento delle risorse si sblocca raggiungendo o superando la singola casella; la tensione copre le prime righe.
- **Rondella a sette caselle:** tutti iniziano su Affinità (−1 marco per assumere una nazionalità già presente nel reparto, minimo 1). Dopo i turni9 e18 devi avanzare da uno a sei passi: i primi tre sono gratuiti, gli extra costano un marco ciascuno. Nessun gettone dal movimento; caselle condivise.
- **Welfare:** acquisti da uno a tre gettoni a un marco ciascuno, disponibili dal turno successivo. Scegli come distribuire i marchi fra Economia, Personale e Produzione: alle soglie 3/4/3 si potenziano le abilità collegate per tutti. Se il saldo scende sotto soglia, tornano base.
- **Repressione gratuita:** azzera un reparto, aumenta gli altri di1 e saccheggia un solo fondo scelto, fino alla tensione eliminata e al suo saldo disponibile.
- **Macchinari:** fissi, tensione×3 e Continuità (un marco per ogni riga raggiunta e libera, anche parziale). Incasso immediato all’installazione; tutti spenti se il reparto non ha righe raggiunte libere. Conversioni soltanto con Mutuo soccorso.
- **Punteggio:** commesse, un PV ogni10marchi finali (arrotondato per difetto) e un PV per ogni terna di risorse diverse (un tessuto, un acciaio, un colorante). Tutte36le commesse disponibili.
- **IA:** fino a 15 secondi per confrontare i movimenti quando il Welfare è raggiungibile e gli acquisti Welfare diretti, 3 secondi per le altre scelte. La ricerca termina prima se completa la profondità richiesta e riusa il piano d’azione già scelto.

Il motore conserva le regole precedenti per le configurazioni personalizzate e i salvataggi. La modalità rapida usa d2/r1 per ridurre l’attesa al tavolo; **Approfondito** usa d6/r1 come i test. Le sezioni di riferimento sotto descrivono anche le modalità precedenti.

## Avvio locale dai sorgenti

Richiede Node.js 22 e npm.

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Apri **http://127.0.0.1:5199/lab.html**. Se la porta è occupata, usa l’indirizzo indicato dal server aggiungendo `/lab.html`.

Il Laboratorio aggiornato è `lab.html`; `/` conserva l’interfaccia storica per compatibilità. Gli impiegati sono esclusi dal nuovo Laboratorio. In Città si consegna una sola commessa per visita, con conclusione automatica del turno; non si acquistano carte.

I valori di riferimento delle commesse sono **5 PV per le piccole, 9 per le medie e 13 per le grandi**.

Per ora il Laboratorio conta **solo i punti delle commesse**. Gare e premi per nazionalità, conversioni finali di marchi e risorse, soglie del tracciato e altri bonus non assegnano PV. I marchi e le risorse continuano a servire durante la partita. A parità di punti vince chi ha più marchi rimasti; se il pareggio continua, chi ha completato più commesse.

Anche le partite salvate vengono ricalcolate automaticamente con questo punteggio, comprese le mosse annullabili e i risultati conclusivi. La partita riprende senza azzerare turni, carte, risorse o commesse. Gli altri costi e le regole di produzione conservano le impostazioni del salvataggio. Le configurazioni importate perdono le precedenti impostazioni dei premi extra. Le vecchie prove con punteggi diversi non sono direttamente confrontabili con quelle attuali. La modalità storica conserva le sue regole.

## Esperimenti e lotti di partite

In **Plancia produttiva** puoi spostare la soglia di sblocco all’interno di ogni riga e attivare il premio di **1 risorsa immediata** quando un avanzamento la raggiunge o la supera. Ogni soglia paga una sola volta; le righe rimangono sbloccate, ma la tensione può coprirle durante le produzioni. Le soglie già raggiunte nel setup non pagano il premio.

In **Welfare e denaro** puoi attivare l’effetto del macchinario anche all’installazione. Resta poi installato e si riattiva con il reparto. Installare la seconda carta attiva subito solo quella nuova. Le due opzioni immediate sono inizialmente disattivate; le configurazioni precedenti mantengono il comportamento originario.

In **Simulazione** scegli da 1 a 100 partite, giocatori, turni, IA e seme. Il lotto fotografa tutte le impostazioni all’avvio e usa semi consecutivi. Per un confronto cambia una regola e conserva IA e semi. La nuova IA resta selezionabile a d6/r1; la modalità rapida serve per i controlli tecnici.

**Scarica report .md** e **Copia report per l’analisi** producono lo stesso report dettagliato: risultati, assunzioni e sconti, soglie, macchinari singoli e in coppia, rendite immediate e successive, welfare, repressione, commesse, conversioni e bilanci economici. Ogni partita completa verifica conservazione di marchi e risorse e corrispondenza delle rendite registrate con gli incassi del motore. Il report include configurazione e semi; **Scarica dati e mosse** conserva anche cronologia e stato finale.

Puoi fermare il lotto conservando ed esportando le partite finite. I risultati del lotto restano nella pagina: scaricali prima di chiuderla o ricaricarla. Le differenze tra gruppi di giocatori descrivono correlazioni, non dimostrano da sole l’effetto di una regola.

## Verificare e compilare

```sh
npm run check:lab
npm run build:lab
```

La compilazione aggiorna **dist-lab/lab.html**, incluso nel repository per poterlo scaricare direttamente. Dopo modifiche al codice, ricompilalo prima di caricare l’aggiornamento.

I controlli coprono configurazione, partite complete, azioni legali, commesse, scambi di risorse, punteggio e ripristino dei salvataggi. Gli studi storici opzionali richiedono i relativi report locali, non inclusi nel repository.

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

### Aggiornamenti dalla Home del telefono
All’apertura e al ritorno in primo piano il simulatore controlla `version.json` senza usare la cache. Ogni pubblicazione genera automaticamente un identificatore di versione e la data della compilazione, visibili nel laboratorio. Una nuova versione si apre con un indirizzo aggiornato, sullo stesso dominio e percorso: configurazione e partita in localStorage rimangono disponibili. Durante una partita o simulazione l’aggiornamento viene rinviato al ritorno al laboratorio. Senza connessione o dopo quattro secondi di attesa si può comunque usare la versione già caricata; il laboratorio consente di riprovare il controllo.

Per ricevere questo controllo, le versioni precedenti devono essere ricaricate manualmente una prima volta. Nessun service worker è installato; il controllo non aggiunge il download offline dell’app. `version.json` va pubblicato insieme al file HTML compilato.

La produzione presenta due modalità: **Intensa** usa tutte le righe accessibili e attiva i macchinari, poi aumenta la tensione di 1; **Protetta** offre gli stessi rendimenti e spende un gettone welfare per impedire l’aumento. Nel tracciato di riferimento ogni riga dà una risorsa.

Il welfare costa **4 marchi per 3 gettoni**, utilizzabili dal proprio turno successivo, **solo nel reparto in cui si trova il procuratore**. Se non si produce, dopo un acquisto oppure rinunciando all’azione si possono spendere più gettoni insieme per curare quel reparto: **−1 tensione per gettone, fino a zero**. Non si può curare nello stesso turno in cui si produce. I gettoni non scontano le assunzioni e non valgono punti a fine partita. Le nuove partite usano il prezzo aggiornato; quelle già salvate conservano il prezzo con cui sono iniziate.

La repressione mantiene il costo fisso di **2 marchi**: azzera la tensione di un reparto e aumenta di 1 quella degli altri due, fino al limite del tracciato. I prezzi indicati sono quelli di riferimento e rimangono modificabili nell’editor.

### Rondella Welfare sperimentale

In **Welfare e denaro**, attiva **Attiva la rondella Welfare** per le nuove partite e simulazioni. Il modello a pacchetti resta disponibile per il confronto; le partite già salvate conservano le proprie regole.

Al Welfare scegli tra acquistare una carta ed eseguire l’azione della rondella. Scegli 1–6 passi: ciascun passo costa 1 marco e dà 1 gettone, utilizzabile dal turno successivo. Al primo ingresso scegli liberamente la politica; poi procedi in senso orario. Sei passi fanno un giro completo e conservano la politica attuale. Gli spazi sono attraversabili e condivisi, con lo stesso beneficio per ogni occupante. Il bonus personale resta attivo fino al prossimo spostamento; le caselle attraversate non si attivano.

Ordine delle politiche:

1. **Formazione:** +1 passo di sviluppo per ogni operaio assunto Sopra, entro il limite del tracciato.
2. **Cooperazione:** +1 marco quando produci in un reparto con almeno due nazionalità fra gli operai Sopra.
3. **Innovazione:** −1 marco per installare un macchinario, minimo 1.
4. **Affidabilità:** +2 marchi per ogni commessa completata.
5. **Integrazione:** −1 marco per assumere Sopra una nazionalità assente nel reparto, minimo 1. Lo sconto per connazionali continua ad applicarsi alle altre assunzioni.
6. **Mutuo soccorso:** una conversione facoltativa per produzione, da una risorsa appena prodotta dal reparto a una di un altro settore. Non si attiva con scorte vecchie a produzione nulla o all’installazione di macchinari.

La simulazione valuta le destinazioni e i passi come alternative legali. I report Markdown/JSON registrano la cronologia delle visite e i benefici effettivi di ogni politica, separati dalle rendite dei macchinari. Questi valori sono una prima ipotesi da provare, non un bilanciamento dimostrato.
