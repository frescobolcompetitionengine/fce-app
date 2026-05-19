// /opt/processing-3.5.4/processing-java --sketch=/x/frescogo/placar-radar/placar --run
// - EXE: mock/auto/timeout=false/false/5000, fullscreen
// - pkill -9 -f processing

// - testar em outras máquinas
// - cores vm,am,az porporcional ata/tot
// - mostrar todos os parametros na configuracao: quedas/aborta
// - pontuacao media
// - data de inicio do jogo (usar no relatorio?)

// add chico to dialout
// cu -l /dev/ttyUSB0

import processing.serial.*;
import processing.sound.*;
import java.io.*;

int         MAJOR    = 5;
int         MINOR    = 3;
int         REVISION = 0;
String      VERSAO   = MAJOR + "." + MINOR + "." + REVISION;

JSONObject  CONF;
int         NOW;
int         MODO = 0;      // 0=jogo, 1=debug

Serial      RADAR;
int         RADAR_ERR  = 0;
boolean     RADAR_MOCK = false;
int         RADAR_MOCK_SPEED = 500;
boolean     RADAR_AUTO = false;
int         RADAR_AUTO_TIMEOUT = 3500; //99999; //3500;
int         RADAR_AUTO_INICIO;
PrintWriter RADAR_OUT;

int         KEY_TIMER;
int         KEY_TIMER_EXPIRE = 2000;

boolean     ESQUENTA = false;
int         ESQUENTA_INICIO;

SoundFile[] SNDS = new SoundFile[8];
SoundFile[] HITS = new SoundFile[7];

int         CONF_TEMPO;
int         CONF_DISTANCIA;
int         CONF_GOLPES;
int         CONF_EQUILIBRIO;
int         CONF_VEL_MIN;
int         CONF_VEL_MAX;
int         CONF_MAXIMAS;
int         CONF_INTENSIDADE;
int         CONF_SAQUE;
boolean     CONF_TRINCA;
int         CONF_TREGUA;
int         CONF_QUEDAS;
int         CONF_ABORTA;
int         CONF_ESQUENTA;
int         CONF_DESCANSO;

int         LADO_RADAR;
int         LADO_PIVO;
int         RADAR_REPS;
int         RADAR_IGUAL;
int         RADAR_OPOSI;

int         CONF_RECORDE;
String[]    CONF_NOMES = new String[3];
int         CONF_REGRA;
String      CONF_SERIAL;

PImage      IMG1, IMG2;
PImage      IMG_SPEED;
PImage      IMG_GOLPES;
PImage      IMG_BAND;
PImage      IMG_APITO;
PImage      IMG_TROFEU;
PImage      IMG_DESCANSO;
PImage      IMG_RADAR_OK;
PImage      IMG_RADAR_NO;
PImage      IMG_RAQUETE;

int         GOLPE_DELAY = 1500; //99999; //1500;

String      ESTADO = "ocioso";         // ocioso, digitando, jogando, terminando, terminado
int         ESTADO_DIGITANDO = 255;    // 0=esq, 1=dir, 2=arbitro
String      ESTADO_JOGANDO;            // sacando, jogando

int         INSS_DIFF = 1500;    // maximo intervalo entre golpes continuos
int         INSS_SOUND_NEW = 0;
int         INSS_SOUND_OLD = 0;

boolean     INV = false;
int         ZER = 0;
int         ONE = 1;
int         BACK = 0;

int         JOGO_DESCANSO_TOTAL, JOGO_DESCANSO_INICIO;
boolean     JOGO_DESCANSO_PLAY;
int         JOGO_TOTAL, JOGO_QUEDAS, JOGO_QUEDAS_MANUAL;
int         JOGO_TEMPO_INICIO, JOGO_TEMPO_PASSADO, JOGO_TEMPO_RESTANTE, JOGO_TEMPO_RESTANTE_SHOW, JOGO_TEMPO_RESTANTE_OLD;

int[][]     JOGO_JOGS = new int[2][12];
  // pts, golpes, med, min, max, med_min, med_max, n_nrms,n_baks,k_nrms,k_baks, ins

int IDX_PTS   = 0;
int IDX_GLP   = 1;
int IDX_MED   = 2;
int IDX_MIN   = 3;
int IDX_MAX   = 4;
int IDX_MMIN  = 5;
int IDX_MMAX  = 6;
int IDX_NRMS  = 7;
int IDX_BAKS  = 8;
int IDX_MNRMS = 9;
int IDX_MBAKS = 10;
int IDX_INSS  = 11;

float       dy; // 0.001 height
float       dx; // 0.001 width
float       W;
float       H;

ArrayList<ArrayList> JOGO = new ArrayList<ArrayList>();
    // /------------ seqs -----------\
    //    /--------- seq ---------\
    //      /------ golpe ------\
    // { { { now,jog,kmh,bak,ins } } }
    //        0   1   2   3   4

int IDX_NOW = 0;
int IDX_JOG = 1;
int IDX_KMH = 2;
int IDX_BAK = 3;
int IDX_INS = 4;

String ns (String str, int n) {
    int len = str.length();
    for (int i=0; i<n-len; i++) {
        str += " ";
    }
    return str;
}

///////////////////////////////////////////////////////////////////////////////

String conf_pars () {
    return "v" + VERSAO + " / " +
           "regra " + CONF_REGRA + " / " +
           (CONF_TRINCA ? "trinca" : "dupla") + " / " +
           (conf_radar() ? "radar" : CONF_DISTANCIA + "cm") + " / " +
           (CONF_REGRA==4 ?
                "" :
                (CONF_MAXIMAS    ==0 ? "-maxs" : "+maxs") + "/" +
                (CONF_INTENSIDADE==0 ? "-ints" : "+ints") + " / "
           ) +
           CONF_TEMPO   + "s";
}

int conf_tempo () {
    return (ESQUENTA ? CONF_ESQUENTA : CONF_TEMPO);
}

int conf_golpes (int jog) {
    if (CONF_TRINCA) {
        if (jog == LADO_PIVO) {
            return 0;
        } else {
            return max(1, conf_tempo() * CONF_GOLPES / 60);
        }
    } else {
        return max(1, conf_tempo() * CONF_GOLPES / 60 / 2);
    }
}

int conf_maximas (int jog) {
    if (CONF_TRINCA) {
        if (jog == LADO_PIVO) {
            return 0;
        } else {
            return max(1, conf_tempo() * CONF_MAXIMAS / 60);
        }
    } else {
        return max(1, conf_tempo() * CONF_MAXIMAS / 60 / 2);
    }
}

int conf_quedas_base () {
    return CONF_TREGUA * conf_tempo() / 60;    // 1 / 60s
}

int conf_quedas_pena () {
    return CONF_QUEDAS * 60 / conf_tempo();    // 12% / 60s
}

int conf_aborta () {
    return conf_tempo() / CONF_ABORTA;         // 1 queda / 15s
}

boolean conf_radar () {
    return (RADAR!=null || RADAR_MOCK);
}

///////////////////////////////////////////////////////////////////////////////

void go_esquenta () {
    ESTADO = "ocioso";
    JOGO = new ArrayList<ArrayList>();
    JOGO_DESCANSO_TOTAL     = 0;
    JOGO_DESCANSO_PLAY      = false;
    JOGO_TEMPO_RESTANTE_OLD = conf_tempo();
    JOGO_QUEDAS             = 0;
    JOGO_QUEDAS_MANUAL      = 0;
    JOGO_TEMPO_INICIO       = millis();
    SNDS[1].play();
}

void go_reinicio () {
    ESTADO = "ocioso";
    JOGO = new ArrayList<ArrayList>();
    JOGO_DESCANSO_TOTAL     = 0;
    JOGO_DESCANSO_PLAY      = false;
    JOGO_TEMPO_RESTANTE_OLD = conf_tempo();
    JOGO_QUEDAS             = 0;
    JOGO_QUEDAS_MANUAL      = 0;
    JOGO_TEMPO_INICIO       = millis();
    INSS_SOUND_NEW = INSS_SOUND_OLD = 0;
    SNDS[1].play();
}

void go_saque () {
    ESTADO = "jogando";
    ESTADO_JOGANDO = "sacando";
    JOGO_DESCANSO_INICIO = millis();
    JOGO.add(new ArrayList<int[]>());
    SNDS[5].play();
    if (RADAR != null) {
        RADAR.clear();
    }
    if (ESQUENTA) {
        ESQUENTA_INICIO = NOW;
    }
}

void go_queda () {
    if (ESQUENTA) {
        return;
    }
    ESTADO = "ocioso";
    JOGO_QUEDAS++;
    if (jogo_quedas() >= conf_aborta()) {
        go_terminando();
    } else {
        SNDS[0].play();
        if (RADAR_AUTO) {
            delay(1000);
            go_saque();
        }
    }
}

void go_terminando () {
    ESTADO = "terminando";
}

 void go_termino () {
    ESTADO = "terminado";
    SNDS[3].play();
    if (JOGO_TOTAL > CONF_RECORDE) {
        CONF_RECORDE = JOGO_TOTAL;
    }

    draw();

    if (ESQUENTA) {
        return;
    }

    String ts = "" + year() + "_" + nf(month(),2) + "_" + nf(day(),2) + "_"
                   + nf(hour(),2) + "_" + nf(minute(),2) + "_" + nf(second(),2);

    // placar.png
    saveFrame("relatorios/frescogo-"+ts+"-"+CONF_NOMES[0]+"-"+CONF_NOMES[1]+"-placar.png");

    // placar.txt
    {
        String manual = "";
        if (JOGO_QUEDAS_MANUAL != 0) {
            String plus = (JOGO_QUEDAS_MANUAL > 0 ? "+" : "");
            manual = " (" + JOGO_QUEDAS + plus + JOGO_QUEDAS_MANUAL + ")";
        }

        String[] jogs = new String[2];
        for (int i=0; i<2; i++) {
            jogs[i] = ns(CONF_NOMES[i]+":",15) + nf(JOGO_JOGS[i][IDX_PTS],5) + " pontos / " +
                      nf(JOGO_JOGS[i][IDX_GLP],3) + " golpes / " +
                      nf(JOGO_JOGS[i][IDX_MED]/100,2) + "." + nf(JOGO_JOGS[i][IDX_MED]%100,2) + " km/h" + "\n";
        }

        int[] ps = jogo_equ();

        String out = ns("Data:",          15) + ts + "\n"
                   + ns("Versão:",        15) + conf_pars() + "\n"
                   //+ "\n"
                   //+ ns("Descanso:",      15) + (JOGO_DESCANSO_TOTAL/1000) + "\n"
                   //+ ns("Quedas:",        15) + jogo_quedas() + manual + "\n"
                   //+ "\n"
                   //+ jogs[0] + jogs[1]
                   //+ "\n"
                   //+ ns("Parcial:",       15) + nf(JOGO_JOGS[0][0]+JOGO_JOGS[1][0],5) + " pontos\n"
                   //+ ns("Desequilibrio:", 15) + nf((JOGO_JOGS[0][0]+JOGO_JOGS[1][0]) - (ps[0]+ps[1]), 5) + " (-)\n"
                   //+ ns("Quedas:",        15) + nf(ps[0]+ps[1] - JOGO_TOTAL, 5) + " (-)\n"
                   //+ "\n"
                   + ns("Total:",         15) + nf(JOGO_TOTAL,5) + " pontos\n"
                   + "\n";
        for (int i=0; i<JOGO.size(); i++) {
            ArrayList<int[]> seq = JOGO.get(i);
            out += "SEQUÊNCIA " + nf(i+1,2) + "\n============\n\nTEMPO   DIR   KMH * +\n-----   ---   --- - -\n";
            for (int j=0; j<seq.size(); j++) {
                int[] golpe = seq.get(j);
                int ms = golpe[IDX_NOW] - JOGO_TEMPO_INICIO;
                out += nf(ms,6) + "   " + (golpe[IDX_JOG]==0 ? "->" : "<-") + "   " + nf(jogo_kmh(seq,j),3) + " " + (golpe[IDX_BAK]==0 ? " " : "*") + " " + (golpe[IDX_INS]==0 ? " " : "+") + "\n";
            }
            out += "\n\n";
        }
        String[] outs = { out };
        String name = "relatorios/frescogo-"+ts+"-"+CONF_NOMES[0]+"-"+CONF_NOMES[1]+".txt";
        saveStrings(name, outs);
    }

    // resultados.csv
    try {
        File file = new File(sketchPath("") + "/relatorios/resultados.csv");
        if (!file.exists()) {
            file.createNewFile();
        }

        FileWriter     fw = new FileWriter(file, true);
        BufferedWriter bw = new BufferedWriter(fw);
        PrintWriter    pw = new PrintWriter(bw);
        pw.write (
            ts + " ; " + JOGO_TOTAL + " ; " + jogo_quedas() + " ; " + (JOGO_DESCANSO_TOTAL/1000) + " ; " +
            CONF_NOMES[0] + " ; " + JOGO_JOGS[0][IDX_PTS] + " ; " + JOGO_JOGS[0][IDX_GLP] + " ; " + (float(JOGO_JOGS[0][IDX_MED])/100) + " ; " +
            CONF_NOMES[1] + " ; " + JOGO_JOGS[1][IDX_PTS] + " ; " + JOGO_JOGS[1][IDX_GLP] + " ; " + (float(JOGO_JOGS[1][IDX_MED])/100) + " ; " +
            "\n"
        );
        pw.close();
    } catch (IOException e) {
        println("Erro em 'resultados.csv'.");
        exit();
    }
}

///////////////////////////////////////////////////////////////////////////////

void _jogo_tempo () {
    int ret = 0;
    int last = NOW;

    if (ESQUENTA) {
        if (!ESTADO.equals("ocioso")) {
            ret = NOW - ESQUENTA_INICIO;
        }
    } else {
        for (int i=0; i<JOGO.size(); i++) {
            ArrayList<int[]> seq = JOGO.get(i);
            int S = seq.size();
            if (S > 0) {
                last = seq.get(S-1)[IDX_NOW];
                if (S >= 2) {
                    ret += (last - seq.get(0)[IDX_NOW]);
                }
            }
        }
        //if (ESTADO.equals("jogando") && ESTADO_JOGANDO.equals("jogando")) {
        //    ArrayList<int[]> seq = JOGO.get(JOGO.size()-1);
        //    ret += millis() - seq.get(seq.size()-1)[0];
        //}
    }

    JOGO_TEMPO_PASSADO = ret / 1000;
    JOGO_TEMPO_RESTANTE = max(0, conf_tempo()-JOGO_TEMPO_PASSADO);
    JOGO_TEMPO_RESTANTE_SHOW = JOGO_TEMPO_RESTANTE;

    if (ESTADO.equals("jogando") && ESTADO_JOGANDO.equals("jogando")) {
        JOGO_TEMPO_RESTANTE_SHOW -= ((NOW - last) / 1000);
    }
}

void _jogo_lado_ins (ArrayList<int[]> seq, IntList inss) {
    IntList kmhs = new IntList();
    for (int i=0; i<inss.size(); i++) {
        int kmh = jogo_kmh(seq, inss.get(i));
        kmhs.append(kmh);
    }
    kmhs.sortReverse();
    for (int i=0; i<inss.size(); i++) {
        int I = inss.get(i);
        int kmh = jogo_kmh(seq, I);
        if (kmh == kmhs.get(CONF_INTENSIDADE/2)) {
            seq.get(I)[IDX_INS] = 1;
            break;
        }
    }
}

void _jogo_lado (int jog) {
    IntList kmhs = new IntList();
    IntList nrms = new IntList();
    IntList baks = new IntList();

    // INTENSIDADE
    int ninss = 0;

    for (int i=0; i<JOGO.size(); i++) {
        ArrayList<int[]> seq = JOGO.get(i);
        IntList inss = new IntList();
        int inss_now = -1;
        for (int j=0; j<seq.size()-1; j++) {    // -1: ignora ultimo golpe
            int[] golpe = seq.get(j);
            if (golpe[IDX_JOG] != jog) {
                continue;
            }

            int kmh = jogo_kmh(seq,j);

            int[] prev1 = new int[] {};
            int[] prev2 = new int[] {};
            if (j > 0) {
                prev1 = seq.get(j-1);
            }
            if (j > 1) {
                prev2 = seq.get(j-2);
            }

            if (kmh >= CONF_VEL_MIN) {
                kmhs.append(kmh);

                // ataque nrm/bak valido?
                if (CONF_MAXIMAS!=0 && j>0) { // precisa de golpe anterior
                    int kmh2 = jogo_kmh(seq,j-1);
                    // se passou 1s || repetiu jog || 20% mais forte
                    if (prev1[IDX_NOW]+1000<golpe[IDX_NOW] || prev1[IDX_JOG]==jog || kmh2*1.2<=kmh) {
                        if (golpe[IDX_BAK] == 0) {
                            nrms.append(kmh);
                        } else {
                            baks.append(kmh);
                        }
                    }
                }
            }

            if (CONF_INTENSIDADE != 0) {
                golpe[IDX_INS] = 0;   // zera ins
                int n = inss.size();
                boolean ok0 = (golpe[IDX_NOW] <= inss_now+INSS_DIFF);
                boolean ok1 = (j<=0 || prev1[IDX_JOG]==jog);
                boolean ok2 = (j<=1 || prev2[IDX_JOG]==jog);
                if ((n==0 || (ok0 && (ok1 || ok2))) && kmh>=CONF_VEL_MIN) {
                    if (inss.size() == 2*CONF_INTENSIDADE-1) {
                        IntList tmp = new IntList();
                        int z = inss.size();
                        for (int k=CONF_INTENSIDADE; k<z; k++) {
                            tmp.append(inss.get(CONF_INTENSIDADE));
                            inss.remove(CONF_INTENSIDADE);
                        }
                        ninss++;
                        _jogo_lado_ins(seq, inss);
                        inss = tmp;
                    }
                    inss.append(j);
                    inss_now = golpe[IDX_NOW];
                    if (inss.size() == CONF_INTENSIDADE) {
                        int s = i*100 + j;
                        if (s > INSS_SOUND_NEW) {
                            INSS_SOUND_NEW = s;
                        }
                    }
                } else {
                    if (inss.size() >= CONF_INTENSIDADE) {
                        ninss++;
                        _jogo_lado_ins(seq, inss);
                    }
                    inss.clear();
                    if (kmh >= CONF_VEL_MIN) {
                        inss.append(j);
                    }
                }
            }
        }
        if (CONF_INTENSIDADE!=0 && inss.size()>=CONF_INTENSIDADE) {
            ninss++;
            _jogo_lado_ins(seq, inss);
        }
    }
    kmhs.sortReverse();
    nrms.sortReverse();
    baks.sortReverse();

    int glps = conf_golpes(jog);

    // GOLPES
    int N = min(glps,kmhs.size());
    int sum1 = 0;   // simples
    int sum2 = 0;   // quadrado
    for (int i=0; i<N; i++) {
        int cur = kmhs.get(i);
        sum1 += cur;
        if (CONF_REGRA == 4) {
            sum2 += cur*cur/50;
        } else {
            sum2 += cur*(50+cur)/100;
        }
    }

    int Nmax = min(glps/2, N);
    int Nmin = min(glps/2, N-Nmax);

    // MAXIMAS
    int sumMin = 0;
    int sumMax = 0;
    for (int i=0; i<Nmax; i++) {
        int cur = kmhs.get(i);
        sumMax += cur;
    }
    for (int i=0; i<Nmin; i++) {
        int cur = kmhs.get(Nmax+i);
        sumMin += cur;
    }

    // INTENSIDADE
    if (CONF_REGRA==5 && CONF_INTENSIDADE!=0) {
        for (int i=0; i<JOGO.size(); i++) {
            ArrayList<int[]> seq = JOGO.get(i);
            for (int j=0; j<seq.size(); j++) {
                int[] golpe = seq.get(j);
                if (golpe[IDX_JOG]==jog && golpe[IDX_INS]==1) {
                    int cur = jogo_kmh(seq,j);
                    sum2 += cur*(50+cur)/100;
                }
            }
        }
    }

    // BAKS+NRMS
    int nrm1 = 0;
    int bak1 = 0;
    int maxs = conf_maximas(jog);
    if (CONF_REGRA==5 && CONF_MAXIMAS!=0) {
        for (int i=0; i<min(maxs,nrms.size()); i++) {
            int nrm = min(100,nrms.get(i)); // >100 probably error
            nrm1 += nrm;
            sum2 += nrm*(50+nrm)/100;
        }
        for (int i=0; i<min(maxs,baks.size()); i++) {
            int bak = min(100,baks.get(i)); // >100 probably error
            bak1 += bak;
            sum2 += bak*(50+bak)/100;
        }
    }

/*
    println("-=-=-=-=-=-");
    println(glps);
    println(NN);
    println(size);
    println(Nmax);
    println(Nmin);
*/

    JOGO_JOGS[jog][IDX_PTS]   = sum2;
    JOGO_JOGS[jog][IDX_GLP]   = kmhs.size();
    JOGO_JOGS[jog][IDX_MED]   = sum1 * 100 / max(1,N);
    JOGO_JOGS[jog][IDX_MIN]   = (N == 0) ? 0 : kmhs.get(N-1);
    JOGO_JOGS[jog][IDX_MAX]   = (N == 0) ? 0 : kmhs.get(0);
    JOGO_JOGS[jog][IDX_MMIN]  = sumMin * 100 / max(1,glps/2);
    JOGO_JOGS[jog][IDX_MMAX]  = sumMax * 100 / max(1,glps/2);
    JOGO_JOGS[jog][IDX_NRMS]  = nrms.size();
    JOGO_JOGS[jog][IDX_BAKS]  = baks.size();
    JOGO_JOGS[jog][IDX_MNRMS] = nrm1 * 100 / maxs;
    JOGO_JOGS[jog][IDX_MBAKS] = bak1 * 100 / maxs;
    JOGO_JOGS[jog][IDX_INSS]  = ninss;
}

int jogo_kmh (ArrayList<int[]> seq, int i) {
    int[] cur = seq.get(i);
    int kmh = cur[IDX_KMH];
    if (kmh != 0) {     // radar ligado
        return min(100, kmh); // >100 probably error
    } else {            // radar desligado
        if (seq.size() < i+2) {
            return 0;
        } else {
            int[] nxt = seq.get(i+1);
            return min(CONF_VEL_MAX, 36 * CONF_DISTANCIA / (nxt[IDX_NOW] - cur[IDX_NOW]));
        }
    }
}

int jogo_quedas () {
    return JOGO_QUEDAS + JOGO_QUEDAS_MANUAL;
}

int jogo_quedas_pct () {
    return max(0, jogo_quedas()-conf_quedas_base()) * conf_quedas_pena();
}

int[] jogo_equ () {
    int p0 = JOGO_JOGS[0][IDX_PTS];
    int p1 = JOGO_JOGS[1][IDX_PTS];

    int n0 = JOGO_JOGS[0][IDX_GLP];
    int n1 = JOGO_JOGS[1][IDX_GLP];

    if (CONF_EQUILIBRIO != 0) {
        int pct = max(0, 100-JOGO_TEMPO_PASSADO);
        p0 = min(p0, max(p0*pct/100, p1*CONF_EQUILIBRIO/100));
        p1 = min(p1, max(p1*pct/100, p0*CONF_EQUILIBRIO/100));
    }

    return new int[] {p0,p1};
}

void jogo_calc () {
    _jogo_tempo();
    _jogo_lado(0);
    _jogo_lado(1);

    int[] ps = jogo_equ();
    JOGO_TOTAL = (ps[0]+ps[1]) * (10000-jogo_quedas_pct()) / 10000;
}

///////////////////////////////////////////////////////////////////////////////

int old = millis();
int radar_mock () {
    int dt  = NOW - old;
    if (dt > RADAR_MOCK_SPEED) {
        old = NOW;
        if (random(0,4) <= 2) {
            int vel = int(random(30,CONF_VEL_MAX));
            return (int(random(0,5))>=2) ? vel : -vel;
        }
    }
    return 0;
}

int     BUF_I = 0;
int[][] BUF   = { {0,0},{0,0},{0,0},{0,0},{0,0},    // RADAR_REPS_MAX = 10
                  {0,0},{0,0},{0,0},{0,0},{0,0} };

int _SIZE     = 18;
int _peak_dir = 0;
int _peak_val = 1;
int _live_dir = 5;
int _live_val = 6;
int _size     = 10;
int _ratio    = 13;
int _status   = 16;
int _cr       = 17;

int _VEL = 0;
int _DIR = 1;
int _NOW = 2;

/*
75 km/h = 20.8 m/s
20.8 m - 1000 ms
15.0 m -  721 ms
700ms sem repeticao é seguro
*/
int[] LAST = { 0,-1,0 }; // vel, dir, ms

int four (byte[] s, int idx) {
    return
        (s[idx+0] - '0') * 1000 +
        (s[idx+1] - '0') *  100 +
        (s[idx+2] - '0') *   10 +
        (s[idx+3] - '0') *    1;
}

boolean check_num (byte c) {
    return (c>='0' && c<='9');
}

boolean radar_check (byte[] s) {
    return
        (s[_peak_dir]=='A' || s[_peak_dir]=='C') &&
        check_num(s[_peak_val+0]) &&
        check_num(s[_peak_val+1]) &&
        check_num(s[_peak_val+2]) &&
        check_num(s[_peak_val+3]) &&
        (s[_live_dir]=='A' || s[_live_dir]=='C') &&
        check_num(s[_live_val+0]) &&
        check_num(s[_live_val+1]) &&
        check_num(s[_live_val+2]) &&
        check_num(s[_live_val+3]) &&
        check_num(s[_size+0]) &&
        check_num(s[_size+1]) &&
        check_num(s[_size+2]) &&
        check_num(s[_ratio+0]) &&
        check_num(s[_ratio+1]) &&
        check_num(s[_ratio+2]) &&
        s[_status] == 0x40 &&
        s[_cr] == '\r';
}

// -1: erro ou duvida
// =0: nada detectado
// >0: velocidade se distanciando
// <0: velocidade se aproximando

int radar_be () {
    // aproximadamente 40/50 reads/sec (20/25 ms/read)

    delay(0);                   // sem isso, o programa trava
    if (RADAR.available()<23 || RADAR.read()!=0x88) {
        RADAR_ERR = min(100, RADAR_ERR+1);
        return 0;               // espera o primeiro byte do pacote
    }

    int now = millis();
    byte[] s = RADAR.readBytes(22);

    int dir = (s[7] >> 1) & 0x01;   // 0=out, 1=in
    int vel = four(s,8);
    if (vel == 0) {
        dir = -1;                   // -1=none
    }

    String sdir = (dir == 0) ? "->" : ((dir == 1) ? "<-" : "--");
    String msg = "[" + nf(now/100,4) + "] " + sdir + " " + nf(vel,3);

    if (vel != 0) {
        RADAR_OUT.println(msg);
        RADAR_OUT.flush();
    }

    BUF[BUF_I][_VEL] = vel;
    BUF[BUF_I][_DIR] = dir;
    int I = BUF_I;
    BUF_I = (BUF_I + 1) % RADAR_REPS;

    RADAR_ERR = 0;

    if (MODO == 1) {
        vel = (vel + 5) / 10;  // round
        return (dir == 1) ? -vel : vel;
    }

    // aceito somente se N velocidades na mesma direcao
    for (int i=0; i<RADAR_REPS; i++) {
        vel = max(vel, BUF[i][_VEL]);
        if (BUF[i][_DIR] != BUF[0][_DIR]) {
            RADAR_ERR = min(100, RADAR_ERR+1);
            return -1;      // falhou na direcao
        }
    }

    // duvida se mesma dir em menos de 700ms
    if (dir!=LAST[_DIR] && now<LAST[_NOW]+RADAR_IGUAL) {
        return (vel == 0) ? 0 : -1; // retorna 0 pra contar no timeout de queda
    }
    if (dir==LAST[_DIR] && now<LAST[_NOW]+RADAR_OPOSI) {
        return (vel == 0) ? 0 : -1; // retorna 0 pra contar no timeout de queda
    }

    if (vel!=0 || LAST[_VEL]!=0) {
        String msg2 = ">>> [" + nf(now/100,4) + "] " + sdir + " " + nf(vel,3) + " <<<";
        RADAR_OUT.println(msg2);
        RADAR_OUT.flush();
        println(msg2);
    }

    LAST[_VEL] = vel;
    if (vel != 0) {
        LAST[_DIR] = 1-dir; // negate current dir (only accept opposite next)
        LAST[_NOW] = now;
    }

    BUF[I][_DIR] = -1;  // restarts buffer

    vel = (vel + 5) / 10;  // round
    return (dir == 1) ? -vel : vel;
}

int radar () {
    if (RADAR_MOCK) {
        return radar_mock();
    } else {
        return radar_be();
    }
}

///////////////////////////////////////////////////////////////////////////////

void exit () {
    if (RADAR_OUT != null) {
        RADAR_OUT.close();
    }
    super.exit();
}

void setup () {
    surface.setTitle("FrescoGO! " + VERSAO);
    //size(1000, 600);
    //size(1300, 900);
    fullScreen();

    dy = 0.001 * height;
    dx = 0.001 * width;

    W = width  / 11.0;
    H = height /  8.0;

    // 300s
    // 20 quedas interrompe o jogo
    // 150 golpes máximo por atleta
    // 5 quedas de trégua
    // 3% de penalidade por queda

    CONF            = loadJSONObject("data/conf.json");
    CONF_TEMPO      = CONF.getInt("tempo");      // 300s  = 5mins
    CONF_DISTANCIA  = CONF.getInt("distancia");  // 750cm = 7.5m
    CONF_GOLPES     = CONF.getInt("golpes");     // 60 golpes por minuto para a dupla
    CONF_EQUILIBRIO = CONF.getInt("equilibrio"); // 130=30% de diferenca maxima entre os atletas (0=desligado)
    CONF_VEL_MIN    = CONF.getInt("minima");     // 50km/h menor velocidade contabilizada
    CONF_VEL_MAX    = CONF.getInt("maxima");     // 85km/h maior velocidade contabilizada no modo manual
    CONF_MAXIMAS    = CONF.getInt("maximas");    // 5 ataques de cada lado por minuto
    CONF_INTENSIDADE = CONF.getInt("intensidade"); // 10 golpes continuos
    CONF_SAQUE      = CONF.getInt("saque");      // 45km/h menor velocidade que considera saque no modo autonomo
    CONF_TRINCA     = CONF.getBoolean("trinca");
    CONF_TREGUA     = CONF.getInt("tregua");
    CONF_QUEDAS     = CONF.getInt("quedas");
    CONF_ABORTA     = CONF.getInt("aborta");
    CONF_ESQUENTA   = CONF.getInt("esquenta");
    CONF_DESCANSO   = CONF.getInt("descanso");
    LADO_RADAR      = CONF.getInt("lado_radar") - 1;    // 0=esq, 1=dir
    LADO_PIVO       = CONF.getInt("lado_pivo")  - 1;    // 0=esq, 1=dir
    RADAR_REPS      = CONF.getInt("radar_reps");
    RADAR_IGUAL     = CONF.getInt("radar_igual");
    RADAR_OPOSI     = CONF.getInt("radar_oposi");
    CONF_RECORDE    = CONF.getInt("recorde");
    CONF_NOMES[0]   = "Atleta 1";
    CONF_NOMES[1]   = "Atleta 2";
    CONF_NOMES[2]   = CONF.getString("arbitro");
    CONF_REGRA      = CONF.getInt("regra");         // 4, 5
    CONF_SERIAL     = CONF.getString("serial");     // ""=auto, "desligado", "/dev/ttyUSB0"

    if (CONF_TRINCA) {
        CONF_EQUILIBRIO = 0;
    }

    if (RADAR_MOCK && CONF_INTENSIDADE!=0) {
        CONF_INTENSIDADE = 4;
    }

    SNDS[0] = new SoundFile(this,"snds/fall.wav");
    SNDS[1] = new SoundFile(this,"snds/restart.wav");
    SNDS[2] = new SoundFile(this,"snds/30s.wav");
    SNDS[3] = new SoundFile(this,"snds/queda2.wav");
    SNDS[4] = new SoundFile(this,"snds/undo.wav");
    SNDS[5] = new SoundFile(this,"snds/start.wav");
    SNDS[6] = new SoundFile(this,"snds/clap.wav");
    SNDS[7] = new SoundFile(this,"snds/bonus.wav");
    //SNDS[6] = new SoundFile(this,"snds/zip.aiff");
    //SNDS[6] = new SoundFile(this,"behind.wav");

    HITS[0] = new SoundFile(this,"snds/peteleco.mp3");      // 50--60
    HITS[1] = new SoundFile(this,"snds/agudo.wav");         // 60--70
    HITS[2] = new SoundFile(this,"snds/laser.wav");         // 70--80
    HITS[3] = new SoundFile(this,"snds/hit.wav");           // 80--90
    HITS[4] = new SoundFile(this,"snds/explosion_06.wav");  // 90--100
    HITS[5] = new SoundFile(this,"snds/ambulancia.wav");    // 100--
    HITS[6] = new SoundFile(this,"snds/double.wav");        // defesa

    IMG1         = loadImage(CONF.getString("imagem1"));
    IMG2         = loadImage(CONF.getString("imagem2"));
    IMG_SPEED    = loadImage("icos/speed-03.png");
    IMG_GOLPES   = loadImage("icos/raq-03.png");
    IMG_BAND     = loadImage("icos/flag.png");
    IMG_APITO    = loadImage("icos/apito-04.png");
    IMG_TROFEU   = loadImage("icos/trophy-02.png");
    IMG_DESCANSO = loadImage("icos/timeout-03.png");
    IMG_RADAR_OK = loadImage("icos/radar_ok.png");
    IMG_RADAR_NO = loadImage("icos/radar_no.png");
    IMG_RAQUETE  = loadImage("icos/raq.png");

    IMG1        .resize(0,height/8);
    IMG2        .resize(0,height/8);
    IMG_SPEED   .resize(0,(int)(55*dy));
    IMG_GOLPES  .resize(0,(int)(50*dy));
    IMG_BAND    .resize(0,(int)(40*dy));
    IMG_APITO   .resize(0,(int)(30*dy));
    IMG_TROFEU  .resize(0,(int)(30*dy));
    IMG_DESCANSO.resize(0,(int)(25*dy));
    IMG_RADAR_OK.resize(0,(int)(50*dy));
    IMG_RADAR_NO.resize(0,(int)(50*dy));
    IMG_RAQUETE .resize(0,(int)(40*dy));

    imageMode(CENTER);
    tint(255, 128);
    textFont(createFont("LiberationSans-Bold.ttf", 18));

    if (!CONF_SERIAL.equals("desligado")) {
        try {
            if (CONF_SERIAL.equals("")) {
                String[] list = Serial.list();
                //println(list);
                println(list[list.length-1]);
                RADAR = new Serial(this, list[list.length-1], 9600);
            } else {
                RADAR = new Serial(this, CONF_SERIAL, 9600);
            }
            RADAR_OUT = createWriter("radar.txt");
        } catch (RuntimeException e) {
            println("Erro na comunicação com o radar:");
            println(e);
            //exit();
        }
    }

    go_reinicio();
}

void sound (int kmh, int prv) {
//println(kmh);
    if (kmh < CONF_VEL_MIN) {
//println("min");
        if (!conf_radar()) {
            HITS[0].play();
        }
    } else if (prv > kmh) {
        HITS[6].play();
//println("defesa");
    } else if (kmh < 60) {
//println("<60");
        HITS[0].play();
    } else if (kmh < 70) {
//println("<70");
        HITS[1].play();
    } else if (kmh < 80) {
//println("<80");
        HITS[2].play();
    } else if (kmh < 90) {
//println("<90");
        HITS[3].play();
    } else if (kmh < 100) {
//println("<100");
        HITS[4].play();
    } else {
//println("<xxx");
        HITS[5].play();
    }
}

///////////////////////////////////////////////////////////////////////////////
// KEYBOARD
///////////////////////////////////////////////////////////////////////////////

void trata_nome (int idx, String json) {
    if (key==ENTER || key==RETURN) {
        CONF.setString(json, CONF_NOMES[idx]);
        ESTADO_DIGITANDO = 255;
        ESTADO = "ocioso";
    } else if (key==BACKSPACE) {
        if (CONF_NOMES[idx].length() > 0) {
            CONF_NOMES[idx] = CONF_NOMES[idx].substring(0, CONF_NOMES[idx].length()-1);
        }
    } else if (int(key)>=int('a') && int(key)<=int('z') || int(key)>=int('A') && int(key)<=int('Z') || key=='_'){
        CONF_NOMES[idx] = CONF_NOMES[idx] + key;
        //println(">>>", key);
    }
}

void keyReleased (KeyEvent e) {
    KEY_TIMER = 0;
}

void keyPressed (KeyEvent e) {
    int now = millis();

    if (key==ESC && !e.isControlDown()) {
        key = 0;
    }

    if (!e.isControlDown() || keyCode>=37 && keyCode<=40) {
        // OK, nao precisa segurar 3s
    } else {
        if (KEY_TIMER == 0) {
            KEY_TIMER = now;
            return;                             // comeca a contar 2s
        } else if (KEY_TIMER+KEY_TIMER_EXPIRE > now) {
            return;                             // ainda nao chegou
        } else {
            KEY_TIMER = 0;                      // OK, deixa continuar
        }
    }

    if (e.isControlDown()) {
        if (keyCode == 'Q') {                   // CTRL-Q
            key = ESC;
        } else if (keyCode == 'M') {            // CTRL-M
            MODO = 1 - MODO;
        } else if (keyCode == 'A') {            // CTRL-A
            RADAR_AUTO = !RADAR_AUTO;
            RADAR_AUTO_INICIO = now;
        } else if (keyCode == 'E') {            // CTRL-E
            ESQUENTA = true;
            go_esquenta();
        } else if (keyCode == '-') {
            if (jogo_quedas() > 0) {
                SNDS[4].play();
                JOGO_QUEDAS_MANUAL--;
            }
        } else if (keyCode == '=') {
            SNDS[4].play();
            JOGO_QUEDAS_MANUAL++;
        } else if (keyCode == 'R') {            // CTRL-R
            ESQUENTA = false;
            go_reinicio();
        } else if (keyCode == 'S') {            // CTRL-S
            go_terminando();
        } else if (keyCode == 'I') {            // CTRL-I
            INV = !INV;
            ZER = 1 - ZER;
            ONE = 1 - ONE;
        } else if (keyCode == 'V') {            // CTRL-V
            SNDS[4].play();
            if (CONF_REGRA == 4) {
                CONF_REGRA = 5;
            } else {
                CONF_REGRA = 4;
            }
        }
    }

    if (e.isControlDown() && key==BACKSPACE) {  // CTRL-BACKSPACE
        if (ESTADO.equals("terminado")) {
            ESTADO = "ocioso";
            if (JOGO.size() > 0) {
                if (jogo_quedas() >= conf_aborta()) {
                    JOGO_QUEDAS--;
                }
                JOGO.remove(JOGO.size()-1);
                SNDS[4].play();
            }
        } else if (ESTADO.equals("ocioso")) {
            if (JOGO.size() > 0) {
                JOGO_QUEDAS--;
                JOGO.remove(JOGO.size()-1);
                SNDS[4].play();
            }
        } else if (ESTADO.equals("jogando") && ESTADO_JOGANDO.equals("sacando")) {
            ESTADO = "ocioso";
            if (JOGO.size() > 0) {
                JOGO.remove(JOGO.size()-1);
                if (JOGO.size() > 0) {
                    JOGO_QUEDAS--;
                    JOGO.remove(JOGO.size()-1);
                    SNDS[4].play();
                }
            }
        }

    } else if (ESTADO.equals("ocioso")) {
        if (e.isControlDown()) {
            if (keyCode == '0') {               // CTRL-0
                ESTADO = "digitando";
                ESTADO_DIGITANDO = 2;
                CONF_NOMES[2] = "";
            } else if (keyCode == '1') {        // CTRL-1
                ESTADO = "digitando";
                ESTADO_DIGITANDO = 0;
                CONF_NOMES[0] = "";
            } else if (keyCode == '2') {        // CTRL-2
                ESTADO = "digitando";
                ESTADO_DIGITANDO = 1;
                CONF_NOMES[1] = "";

            } else if (keyCode == 38) {         // CTRL-UP
                go_saque();
            }
        }
    } else if (ESTADO.equals("digitando")) {
        switch (ESTADO_DIGITANDO) {
            case 0: // DIGITANDO ESQ
                trata_nome(0, "atleta1");
                break;
            case 1: // DIGITANDO DIR
                trata_nome(1, "atleta2");
                break;
            case 2: // DIGITANDO ARBITRO
                trata_nome(2, "arbitro");
                break;
        }
    } else if (ESTADO.equals("jogando")) {
//println(keyCode);
        if (e.isControlDown() && (keyCode == 40)) { // CTRL-DOWN
            go_queda();
        } else if (keyCode==37 || keyCode==39) {    // LEFT/RIGHT
            RADAR_AUTO_INICIO = NOW;
            if (ESTADO_JOGANDO.equals("sacando")) {
                ESTADO_JOGANDO = "jogando";
                JOGO_DESCANSO_TOTAL += max(0, NOW-JOGO_DESCANSO_INICIO-5000);
            }

            int jog = (keyCode == 37) ? 0 : 1;
            int[] golpe = { NOW, jog, 0, (BACK!=0 && abs(BACK)+500>=NOW)?1:0, 0 };
            BACK = 0;
            if (conf_radar()) {
                golpe[IDX_KMH] = 30;
            } else {
                // golpe[2]=0  -->  radar desligado
            }

            ArrayList<int[]> seq = JOGO.get(JOGO.size()-1);
            seq.add(golpe);     // add before jogo_kmh

            int kmh = 0;
            int prv = 0;
            int n = seq.size();
            if (n > 1) {
                kmh = jogo_kmh(seq, n-2);
                if (n > 2) {
                    prv = jogo_kmh(seq, n-3);
                    int[] xxx = seq.get(n-2);
                    if (kmh>=CONF_VEL_MIN && kmh<prv &&
                        golpe[IDX_JOG]!=xxx[IDX_JOG] && NOW-750<xxx[IDX_NOW]) {
                    } else {
                        prv = 0;
                    }
                }
            }

            sound(kmh, prv);
        } else if (CONF_MAXIMAS!=0 && (keyCode=='Z' || keyCode=='M')) {
            SNDS[6].play();
            BACK = (keyCode=='Z' ? -NOW : NOW);
            if (conf_radar()) {
                ArrayList<int[]> seq = JOGO.get(JOGO.size()-1);
                int n = seq.size();
                if (n > 0) {
                    int[] xxx = seq.get(n-1);
                    if (xxx[IDX_JOG]==0 && BACK<0 || xxx[IDX_JOG]==1 && BACK>0) {
                        if (abs(BACK)-500 < xxx[IDX_NOW]) {
                            xxx[IDX_BAK] = 1;
                        }
                    }
                }
            }
        }
    }
    jogo_calc();
}

///////////////////////////////////////////////////////////////////////////////
// DRAW
///////////////////////////////////////////////////////////////////////////////

void draw () {
    NOW = millis();
    //println(RADAR);

    // preciso chamar o radar pra ver se ele esta funcionando (sem travar)
    int kmh_ = -1;
    int kmh  =  1;
    if (conf_radar()) {
        kmh_ = radar();
        kmh  = abs(kmh_);
    }

    if (MODO == 1) {
        draw_debug(kmh_);
        return;
    }

    if (ESTADO.equals("jogando")) {
        if (conf_radar()) {
            if (kmh > 1) {
                if (ESTADO_JOGANDO.equals("sacando") && kmh>=CONF_SAQUE) {
                    ESTADO_JOGANDO = "jogando";
                    JOGO_DESCANSO_TOTAL += max(0, NOW-JOGO_DESCANSO_INICIO-5000);
                }
                if (ESTADO_JOGANDO.equals("jogando")) {
                    int jog = (kmh_>0 ? LADO_RADAR : (1-LADO_RADAR));
                    boolean back = (RADAR_MOCK && (int(random(5))==0)) ||
                                   (BACK!=0 && abs(BACK)+500>=NOW &&
                                    (jog==0 && BACK<0 || jog==1 && BACK>0));
                    int[] golpe = { NOW, (kmh_>0 ? LADO_RADAR : (1-LADO_RADAR)), kmh, back?1:0, 0 };
                    BACK = 0;
                    ArrayList<int[]> seq = JOGO.get(JOGO.size()-1);
                    int n = seq.size();
                    int prv = 0;
                    if (n > 0) {
                        int[] xxx = seq.get(n-1);
                        if (kmh>=CONF_VEL_MIN && kmh<xxx[IDX_KMH] &&
                            golpe[IDX_JOG]!=xxx[IDX_JOG] && NOW-750<xxx[IDX_NOW]) {
                            prv = xxx[IDX_KMH];
                        }
                    }
                    sound(kmh, prv);
                    seq.add(golpe);     // golpe[IDX_KMH]!=0  -->  radar ligado
                }
            }
            if (RADAR_AUTO && kmh_!=0) {
//println("!!!ZEROU!!! === " + kmh_);
                // zera o timeout com qq bola que não seja 0
                RADAR_AUTO_INICIO = NOW;
            }
        }
//println(RADAR_AUTO_INICIO + "+" + RADAR_AUTO_TIMEOUT + " < " + NOW);
        if (ESTADO_JOGANDO.equals("jogando") &&
            RADAR_AUTO && NOW>=RADAR_AUTO_INICIO+RADAR_AUTO_TIMEOUT) {
            go_queda();
        }
        if (JOGO_TEMPO_RESTANTE_OLD>30 && JOGO_TEMPO_RESTANTE<=30) {
            SNDS[2].play();
        }
        JOGO_TEMPO_RESTANTE_OLD = JOGO_TEMPO_RESTANTE;
        if (JOGO_TEMPO_RESTANTE <= 0) {
            go_terminando();
        }
    } else if (ESTADO.equals("terminando")) {
        go_termino();
    }

    jogo_calc();
    if (CONF_REGRA==5 && INSS_SOUND_NEW>INSS_SOUND_OLD) {
        INSS_SOUND_OLD = INSS_SOUND_NEW;
//println("ok");
        SNDS[7].play();
    }
    draw_jogo();
}

int kmhs_n = 40;
int[] kmhs = new int[kmhs_n];
int kmhs_i = 0;

void draw_debug (int kmh_) {

    int prv = (kmhs_i == 0) ? 0 : kmhs[(kmhs_i-1)%kmhs_n];
    boolean no = (kmh_ == -1) || (kmh_==0 && prv==0);

    int cur;    // 0, -xx, +xx
    if (no) {
        cur = prv;
    } else {
        kmhs[kmhs_i++%kmhs_n] = kmh_;
        cur = kmh_;
    }

    background(255,255,255);
    fill(0);
    textSize(120*dy);
    textAlign(CENTER, CENTER);
    text(abs(cur), width/2, height/2);

    stroke(color(0,0,255));
    strokeWeight(10*dy);
    if (cur > 0) {
        //ellipse(3*W, 4*H, 60*dy, 60*dy);
        line(2.5*W, 4*H, 2.5*W+60*dy, 4*H);
        line(2.5*W+60*dy, 4*H, 2.5*W+45*dy, 4*H+20*dy);
        line(2.5*W+60*dy, 4*H, 2.5*W+45*dy, 4*H-20*dy);
    } else if (cur < 0) {
        //ellipse(8*W, 4*H, 60*dy, 60*dy);
        line(8.5*W, 4*H, 8.5*W-60*dy, 4*H);
        line(8.5*W-60*dy, 4*H, 8.5*W-45*dy, 4*H-20*dy);
        line(8.5*W-60*dy, 4*H, 8.5*W-45*dy, 4*H+20*dy);
    }
    //strokeWeight(1);
    noStroke();

    int x = width/2 - kmhs_n*20/2;
    textSize(18*dy);
    textAlign(CENTER, CENTER);
    for (int i=0; i<kmhs_n; i++) {
        int curi = kmhs[(kmhs_i+i)%kmhs_n];
        String diri = "";
        if (curi > 0) {
            diri = ">";
        } else if (curi < 0) {
            diri = "<";
        }
        text(abs(curi), x+20*i, height-60);
        text(diri,      x+20*i, height-50);
    }
}

int blink_timer_next;
boolean blink_timer_state;
boolean blink_timer_going = false;

void draw_jogo () {
    background(255,255,255);

    draw_logo(0*W, IMG1);
    draw_logo(7*W, IMG2);

    draw_nome(0*W, ZER, ESTADO_DIGITANDO==ZER);
    draw_nome(7*W, ONE, ESTADO_DIGITANDO==ONE);

    // TEMPO
    {
        int show = max(5, JOGO_TEMPO_RESTANTE_SHOW);
        String mins = nf(show / 60, 2);
        String segs = nf(show % 60, 2);

        if (ESTADO.equals("terminado")) {
            fill(255,0,0);
        } else {
            fill(0);
        }
        rect(4*W, 0, 3*W, 3*H);

        fill(255);
        textSize(140*dy);
        textAlign(CENTER, CENTER);
        if (show>5 || ESTADO.equals("terminado") || blink_timer_state) {
            if (ESTADO.equals("terminado")) {
                blink_timer_going = false;
                text("00:00", width/2, 1.25*H-10*dy);
            } else {
                text(mins+":"+segs, width/2, 1.25*H-10*dy);
            }
        }
        if (show==5 && !blink_timer_going) {
            blink_timer_going = true;
            blink_timer_next  = NOW+500;
            blink_timer_state = true;
        }
        if (NOW >= blink_timer_next) {
            blink_timer_next += 500;
            blink_timer_state = !blink_timer_state;
        }

        if (ESQUENTA) {
            fill(255,0,0);
            textSize(35*dy);
            textAlign(CENTER, CENTER);
            text("AQUECIMENTO", width/2, 2.50*H);
        } else {
            int descanso = JOGO_DESCANSO_TOTAL;
            if (ESTADO.equals("jogando") && ESTADO_JOGANDO.equals("sacando")) {
                descanso += max(0, NOW-JOGO_DESCANSO_INICIO-5000);
            }
            descanso /= 1000;
            descanso = CONF_DESCANSO - descanso;

            if (descanso < 0) {
                fill(255,0,0);
                if (!JOGO_DESCANSO_PLAY) {
                    JOGO_DESCANSO_PLAY = true;
                    SNDS[2].play();
                }
            } else if (ESTADO.equals("terminado")) {
                fill(255);
            } else {
                fill(150,150,150);
            }
            textSize(35*dy);
            textAlign(CENTER, CENTER);
            text(abs(descanso) + " s", width/2, 2.50*H);
            image(IMG_DESCANSO, width/2-50*dx, 2.50*H);
            if (descanso < 0) {
                textSize(20*dy);
                text("(ESGOTADO)", width/2, 2.5*H+30*dy);
            }
        }
    }

    // PARS / INVERTIDO?
    if (ESTADO.equals("terminado")) {
        fill(255);
    } else {
        fill(150,150,150);
    }
    textSize(18*dy);
    textAlign(CENTER, TOP);
    text("("+conf_pars()+")", width/2, 0);
    if (INV) {
        text("inv", width/2, 30*dy);
    }

    // MEIO
    //stroke(0);
    fill(255);
    rect(0, 3*H, 11*W, 2*H-1);

    noFill();
    stroke(1);
    strokeWeight(1);
    rect(0, 3*H, width, 2*H-1);
    if (ESTADO.equals("terminado")) {
        rect(4*W, 0, 3*W, height);
    }
    noStroke();

    // QUEDAS
    {
        fill(255, 0, 0);
        ellipseMode(CENTER);
        ellipse(width/2, height/2, 1.5*H, 1.5*H);

        fill(255);
        textAlign(CENTER, CENTER);
        textSize(110*dy);
        text(jogo_quedas(), width/2, height/2-15*dy);
    }

    if (ESTADO.equals("jogando")) {
        ArrayList<int[]> seq = JOGO.get(JOGO.size()-1);
        int jog = 255;
        for (int i=1; i<=2; i++) {
            if (seq.size() < i) {
                continue;
            }

            int[] golpe = seq.get(seq.size()-i); // millis/jog/kmh
            if (golpe[IDX_JOG] == jog) {
                // mesmo jogador deu os ultimos dois golpes
            } else {
                jog = golpe[IDX_JOG];
                if (NOW <= golpe[IDX_NOW]+GOLPE_DELAY) {
                    int kmh = golpe[IDX_KMH];
                    if (kmh == 0) {
                        int xxx = seq.size() - i - 1;
                        if (xxx >= 0) {
                            kmh = jogo_kmh(seq, seq.size()-i-1);
                            if (jog == ONE) {
                                draw_ultima(1.5*W, kmh);
                            } else {
                                draw_ultima(9.5*W, kmh);
                            }
                        }
                    } else {
                        if (jog == ZER) {
                            draw_ultima(1.5*W, kmh);
                        } else {
                            draw_ultima(9.5*W, kmh);
                        }
                    }
                }
                if (NOW <= golpe[IDX_NOW]+500) {
                    stroke(color(0,0,255));
                    strokeWeight(10*dy);
                    if (jog == ZER) {
                        //ellipse(3*W, 4*H, 60*dy, 60*dy);
                        line(2.5*W, 4*H, 2.5*W+60*dy, 4*H);
                        line(2.5*W+60*dy, 4*H, 2.5*W+45*dy, 4*H+20*dy);
                        line(2.5*W+60*dy, 4*H, 2.5*W+45*dy, 4*H-20*dy);
                    } else {
                        //ellipse(8*W, 4*H, 60*dy, 60*dy);
                        line(8.5*W, 4*H, 8.5*W-60*dy, 4*H);
                        line(8.5*W-60*dy, 4*H, 8.5*W-45*dy, 4*H-20*dy);
                        line(8.5*W-60*dy, 4*H, 8.5*W-45*dy, 4*H+20*dy);
                    }
                    //strokeWeight(1);
                    noStroke();
                }
            }
        }
    } else if (ESTADO.equals("terminado")) {
        //rect(0,   3*H, 4*W, 2*H-1);
        //rect(7*W, 3*H, 4*W, 2*H-1);
        for (int i=0; i<2; i++) {
            draw_lado_medias(0.625*W, ZER);
            draw_lado_medias(7.625*W, ONE);
        }
    }

    if (conf_radar()) {
        PImage img = (RADAR_ERR<=10 ? IMG_RADAR_OK : IMG_RADAR_NO);
        float  x   = (LADO_RADAR==0 ? 20*dx        : width-20*dx);
        if (!ESTADO.equals("terminado")) {
            image(img, x, 4*H);
        }
    }

    if (CONF_TRINCA) {
        if (LADO_PIVO == 0) {
            image(IMG_RAQUETE, 4*W-20*dx,       2.5*H);
            image(IMG_RAQUETE, 7*W+20*dx,       2.5*H-10*dy);
            image(IMG_RAQUETE, 7*W+20*dx+10*dx, 2.5*H+10*dy);
        } else {
            image(IMG_RAQUETE, 4*W-20*dx-10*dx, 2.5*H-10*dy);
            image(IMG_RAQUETE, 4*W-20*dx,       2.5*H+10*dy);
            image(IMG_RAQUETE, 7*W+20*dx,       2.5*H);
        }
    }

    draw_lado(0*W, ZER);
    draw_lado(7*W, ONE);

    {
        fill(0);
        rect(4*W, 5*H, 3*W, 3*H);

        // juiz
        String nome = CONF_NOMES[2];
        if (ESTADO_DIGITANDO != 2) {
            fill(150,150,150);
        } else {
            fill(255,0,0);
            nome = nome + "_";
        }
        textSize(20*dy);
        textAlign(CENTER, TOP);
        text(nome, width/2, 5*H+12*dy);
        float w1 = textWidth(nome);
        image(IMG_APITO, width/2-w1/2-15*dx, 5*H+20*dy);

        // auto
        if (ESQUENTA) {
            fill(200, 200, 0);
            ellipseMode(CENTER);
            ellipse(6.5*W, 5.2*H, 20*dy, 20*dy);
        } else if (RADAR_AUTO) {
            fill(0, 150, 0);
            ellipseMode(CENTER);
            ellipse(6.5*W, 5.2*H, 20*dy, 20*dy);
        }

        // recorde
        if (JOGO_TOTAL >= CONF_RECORDE) {
            fill(150,150,150);
        } else {
            fill(200,100,100);
        }
        textSize(35*dy);
        textAlign(CENTER, CENTER);
        text(CONF_RECORDE, width/2, 6*H-15*dy);
        float w2 = textWidth(str(CONF_RECORDE));
        image(IMG_TROFEU, width/2-w2/2-25*dx, 6*H-10*dy);

        // TOTAL
        fill(255);
        textSize(140*dy);
        textAlign(CENTER, CENTER);
        text(JOGO_TOTAL, width/2, 7*H-15*dy);

        // conta
        int[] ps = jogo_equ();
        fill(150,150,150);
        textSize(15*dy);
        float pct = float(jogo_quedas_pct()) / 100;
        String conta = "(" + (ps[0]+ps[1]) + " - " + pct + "%)";
        text(conta, width/2, 7.5*H+20*dy);
    }
}

void draw_logo (float x, PImage img) {
    noStroke();
    fill(255);
    //rect(x, 0, 4*W, 2*H);
    image(img, x+2*W, H);
}

void draw_nome (float x, int jog, boolean digitando) {
    String nome = CONF_NOMES[jog];
    //stroke(0);
    fill(255);
    //rect(x, 2*H, 4*W, H);
    //image(IMG1, x+1.5*W, 1*H);
    if (digitando) {
        nome = nome + "_";
        fill(255, 0, 0);
    } else {
        noStroke();
        fill(0,0,255);
    }
    textSize(90*dy);
    textAlign(CENTER, CENTER);
    text(nome, x+2*W, 2.25*H-10*dy);
}

void draw_ultima (float x, int kmh) {
    if (kmh == 0) {
        return;
    }
    if (kmh >= CONF_VEL_MIN) {
        fill(0);
    } else {
        fill(200,200,200);
    }
    textAlign(CENTER, BOTTOM);
    textSize(120*dy);
    text(kmh, x, 4*H+45*dy);
    textAlign(CENTER, TOP);
    textSize(30*dy);
    text("km/h", x, 4*H+35*dy);
}

void draw_lado (float x, int jog) {
    int[] JOG = JOGO_JOGS[jog];
    float X = 1.25*W;

    image(IMG_GOLPES, x+W/2, 5.875*H+ 5*dy);
    image(IMG_BAND,   x+W/2, 7.125*H+10*dy);

    // GOLPES

    fill(0);
    textAlign(CENTER, CENTER);
    textSize(65*dy);
    int glps = conf_golpes(jog);
    if (glps>0 && JOG[IDX_GLP]>=glps) {       // golpes vs limite
        fill(0,200,0);
    }
    text(JOG[IDX_GLP], x+2*W, 5.875*H);       // golpes
    fill(150,150,150);
    textSize(20*dy);
    float w1 = textWidth(str(JOG[IDX_GLP]));  // golpes
    textAlign(TOP, LEFT);
    text("/"+glps, x+2*W+w1+10*dx, 5.875*H+30*dy);  // limite

    if (CONF_REGRA==5 && CONF_INTENSIDADE!=0) {
        textSize(20*dy);
        textAlign(TOP, LEFT);
        text("+"+JOG[IDX_INSS], x+2*W+w1+15*dx, 5.875*H); // intensidade
    }


    // MAXIMAS

    if (CONF_REGRA==5 && CONF_MAXIMAS!=0) {
        int atas = conf_maximas(jog);
        for (int i=7; i<=8; i++) {
            fill(0);
            textAlign(CENTER, CENTER);
            textSize(40*dy);
            float y = (i==7) ? 5.625 : 6.125;
            if (JOG[i]>=atas) {         // backs vs limite
                fill(0,200,0);
            }
            int N = min(atas,JOG[i]);
            text(N, x+3.5*W, y*H);      // golpes
            fill(150,150,150);
            textSize(15*dy);
            float w2 = textWidth(str(N)); // golpes
            textAlign(TOP, LEFT);
            text("/"+atas, x+3.5*W+w2+10*dx, y*H+20*dy); // limite
        }
    }

    // PONTOS

    fill(0);
    textAlign(CENTER, CENTER);
    textSize(65*dy);

    // EQUILIBRIO

    if (CONF_EQUILIBRIO != 0) {
        int jog1 = JOGO_JOGS[1-jog][IDX_PTS];
        boolean ok = true;
        int clr = color(0);
        if (jog1>JOG[IDX_PTS]*CONF_EQUILIBRIO/100) {
            clr = color(255,0,0);
            fill(255,0,0);
            ok = false;
        } else if (jog1>JOG[IDX_PTS]*(100+(CONF_EQUILIBRIO-100)/2)/100) {
            fill(255,150,0);
            ok = false;
        }
        if (!ok) {
            int pct = (JOG[IDX_PTS]==0) ? 100 : min(100, jog1*100/JOG[IDX_PTS] - 100);
            textSize(30*dy);
            text("↓"+pct+"%", x+3.5*W, 7.125*H);
            textSize(65*dy);
        }
        fill(clr);
    }
    text(JOG[IDX_PTS], x+2*W, 7.125*H);
}

void draw_lado_medias (float x, int jog) {
    int[] JOG = JOGO_JOGS[jog];
    float X = 0.875*W;
    float x1 = x + X;
    float x2 = x + X+X;
    float x3 = x + X+X+X;

    image(IMG_SPEED, x, 4*H+5*dy);
    noStroke();
    noFill();
    textAlign(CENTER, CENTER);
    fill(100,100,100);
    textSize(15*dy);
    text("km/h", x, 4*H+30*dy);

    textAlign(CENTER, CENTER);
    fill(0);
    float h = 4;
    //float 1 = x;

    // media
    //textSize(65*dy);
    //text(JOG[2]/100, x1, h*H);

    // min / max
    textSize(40*dy);
    text(JOG[IDX_MAX], x1, h*H-H/3);
    text(JOG[IDX_MIN], x1, h*H+H/3);

    // 75+/75-
    textSize(40*dy);
    text(JOG[IDX_MMAX]/100, x2, h*H-H/3);
    text(JOG[IDX_MMIN]/100, x2, h*H+H/3);

    // nrm/inv
    if (CONF_MAXIMAS != 0) {
        textSize(40*dy);
        text(JOG[IDX_MNRMS]/100,  x3, h*H-H/3);
        text(JOG[IDX_MBAKS]/100, x3, h*H+H/3);
    }

    textSize(15*dy);
    fill(150,150,150);
    //text("válidos", x1, h*H+55*dy);
    int glps = conf_golpes(jog) / 2;
    text("máx", x1, h*H-H/3+35*dy);
    text("min", x1, h*H+H/3+35*dy);
    text(glps+"+", x2, h*H-H/3+35*dy);
    text(glps+"-", x2, h*H+H/3+35*dy);

    if (CONF_MAXIMAS != 0) {
        text("dir", x3, h*H-H/3+35*dy);
        text("esq", x3, h*H+H/3+35*dy);
    }
}
