import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePro } from "../../context/ProContext";
import { useUser } from "../../context/UserContext";
import { supabase } from "../../lib/supabase";
import CommunauteWidget from "../../components/CommunauteWidget";
import { extraireVille } from "../../lib/communaute";

type ColocInfo = {
  id: string;
  prenom: string;
  avatar_url?: string;
  statut?: string;
  statut_note?: string;
};

const STATUT_DOT: Record<string, string> = {
  present: "#10B981",
  bientot: "#F59E0B",
  absent: "#94A3B8",
};

const STATUT_ICONE: Record<string, string> = {
  present: "home-outline",
  bientot: "time-outline",
  absent: "moon-outline",
};

type ModalInfo = {
  titre: string;
  corps: string;
  couleur: string;
  icone: string;
};

type EvenementWidget = {
  id: number;
  titre: string;
  date: string;
  heure_debut: string | null;
  icone: string;
  createur: string | null;
  description: string | null;
  participants: string[] | null;
};

type MenageIndexItem = {
  rotationId: number;
  tacheId: number;
  titre: string;
  icone: string;
  fait: boolean;
  assignee: string;
  estMoi: boolean;
  jour_semaine: number | null;
  jourNum: number | null;
};

type MenageTacheDetail = {
  id: number;
  titre: string;
  icone: string;
  jour_semaine: string | null;
};

type RepasItem = {
  id: number;
  date: string;
  moment: "petitdej" | "dejeuner" | "diner";
  titre: string;
  cuisinier: string | null;
};

const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS_COURTS = ["jan","fév","mar","avr","mai","juin","juil","aoû","sep","oct","nov","déc"];

const MOMENTS_REPAS = [
  { key: "petitdej" as const, label: "Petit-déj",  icone: "sunny-outline" as const,      couleur: "#F59E0B" },
  { key: "dejeuner" as const, label: "Déjeuner",   icone: "restaurant-outline" as const,  couleur: "#10B981" },
  { key: "diner"    as const, label: "Dîner",      icone: "moon-outline" as const,        couleur: "#6366F1" },
];

function formatDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getSemaineAvecOffset(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const n = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(n).padStart(2, "0")}`;
}

function getSemaineCourante(): string {
  return getSemaineAvecOffset(0);
}

function lundiDeSemaine(semaineISO: string): Date {
  const [anneeStr, wStr] = semaineISO.split("-W");
  const annee = parseInt(anneeStr);
  const w = parseInt(wStr);
  const simple = new Date(annee, 0, 1 + (w - 1) * 7);
  const dow = simple.getDay();
  const lundi = new Date(simple);
  lundi.setDate(simple.getDate() - (dow <= 4 ? dow - 1 : dow - 8));
  return lundi;
}

function labelJourPourOffset(offset: number): string {
  if (offset === 0) return "Aujourd'hui";
  if (offset === 1) return "Demain";
  if (offset === -1) return "Hier";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const dow = (d.getDay() + 6) % 7;
  return `${JOURS_COURTS[dow]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}

function getDateForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return formatDateISO(d);
}

function wmoToIcone(code: number): { icone: string; couleur: string } {
  if (code === 0)  return { icone: "sunny-outline",        couleur: "#F59E0B" };
  if (code <= 3)   return { icone: "partly-sunny-outline", couleur: "#F59E0B" };
  if (code <= 48)  return { icone: "cloud-outline",        couleur: "#94A3B8" };
  if (code <= 67)  return { icone: "rainy-outline",        couleur: "#6366F1" };
  if (code <= 77)  return { icone: "snow-outline",         couleur: "#93C5FD" };
  if (code <= 82)  return { icone: "rainy-outline",        couleur: "#6366F1" };
  return { icone: "thunderstorm-outline", couleur: "#8B5CF6" };
}

function wmoToLabel(code: number): string {
  if (code === 0)  return "Ensoleillé";
  if (code <= 2)   return "Peu nuageux";
  if (code <= 3)   return "Nuageux";
  if (code <= 48)  return "Brouillard";
  if (code <= 55)  return "Bruine";
  if (code <= 67)  return "Pluie";
  if (code <= 77)  return "Neige";
  if (code <= 82)  return "Averses";
  return "Orage";
}


function getSalutation(prenom: string): string {
  const h = new Date().getHours();
  if (h < 9)  return `Bien dormi, ${prenom} ? ☀️`;
  if (h < 12) return `Bonne matinée, ${prenom} ☕`;
  if (h < 14) return `C'est l'heure du repas, ${prenom} 🍽️`;
  if (h < 18) return `Bonne après-midi, ${prenom} 👋`;
  if (h < 21) return `Bonne soirée, ${prenom} 🌙`;
  return `Encore debout, ${prenom} ? 🦉`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useUser();
  const { isPro } = usePro();
  const insets = useSafeAreaInsets();

  const [colocs, setColocs] = useState<ColocInfo[]>([]);
  const [nomColoc, setNomColoc] = useState<string>("");
  const [adresseColoc, setAdresseColoc] = useState<string>("");
  const [nbChambres, setNbChambres] = useState<number | null>(null);
  const [meteo, setMeteo] = useState<{ temp: number; tempMin: number; tempMax: number; code: number; ville: string } | null>(null);
  const [modalInfo, setModalInfo] = useState<ModalInfo | null>(null);
  const [hamburger, setHamburger] = useState(false);
  const [modalInvit, setModalInvit] = useState(false);
  const [tachesCount, setTachesCount] = useState(0);
  const [articlesCount, setArticlesCount] = useState(0);
  const [depensesTotal, setDepensesTotal] = useState(0);
  const [messagesNonLus, setMessagesNonLus] = useState(0);
  const [mesMenageTaches, setMesMenageTaches] = useState<MenageIndexItem[]>([]);
  const [evenementsWidget, setEvenementsWidget] = useState<EvenementWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [colocCode, setColocCode] = useState<string | null>(null);
  const [repasData, setRepasData] = useState<RepasItem[]>([]);
  const [repasJourOffset, setRepasJourOffset] = useState(0);
  const [menageTachesAll, setMenageTachesAll] = useState<MenageTacheDetail[]>([]);
  const [menagePrenoms, setMenagePrenoms] = useState<string[]>([]);
  const [menageBaseAssignees, setMenageBaseAssignees] = useState<Record<number, string>>({});

  useFocusEffect(
    useCallback(() => {
      chargerDonnees();
    }, []),
  );

  async function chargerDonnees() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: monProfil } = await supabase
      .from("profiles")
      .select("coloc_code, prenom")
      .eq("id", user.id)
      .maybeSingle();

    if (monProfil?.coloc_code) {
      const { data: membres } = await supabase
        .from("profiles")
        .select("id, prenom, avatar_url, statut, statut_note")
        .eq("coloc_code", monProfil.coloc_code)
        .neq("id", user.id);
      setColocs(membres || []);

      const { data: colocData } = await supabase
        .from("colocations")
        .select("nom, adresse, nb_chambres")
        .eq("code_invitation", monProfil.coloc_code)
        .maybeSingle();
      setNomColoc(colocData?.nom ?? "Ma coloc");
      const adresse = colocData?.adresse ?? "";
      setAdresseColoc(adresse);
      setNbChambres(colocData?.nb_chambres ?? null);
      if (adresse) {
        chargerMeteo(adresse);
      }
    } else {
      setColocs([]);
      setNomColoc("");
    }

    const { count: nbTaches } = await supabase
      .from("taches")
      .select("*", { count: "exact", head: true })
      .eq("recurrence", "ponctuelle")
      .eq("fait", false)
      .eq("archive", false);

    const { count: nbArticles } = await supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("coche", false);
    setArticlesCount(nbArticles || 0);

    const { data: depenses } = await supabase
      .from("depenses")
      .select("montant")
      .eq("archive", false);
    setDepensesTotal(depenses?.reduce((sum, d) => sum + (d.montant || 0), 0) || 0);

    if (monProfil?.coloc_code && monProfil?.prenom) {
      const lastSeen = await AsyncStorage.getItem("messages_last_seen");
      const { count: nbGroupe } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("coloc_code", monProfil.coloc_code)
        .neq("auteur", monProfil.prenom)
        .gt("created_at", lastSeen ?? "1970-01-01");
      const { count: nbPrives } = await supabase
        .from("messages_prives")
        .select("*", { count: "exact", head: true })
        .eq("coloc_code", monProfil.coloc_code)
        .eq("destinataire", monProfil.prenom)
        .eq("lu", false);
      setMessagesNonLus((nbGroupe || 0) + (nbPrives || 0));
    }

    if (monProfil?.coloc_code && monProfil?.prenom) {
      setColocCode(monProfil.coloc_code);
      const semaine = getSemaineCourante();

      const { data: toutesLesTaches } = await supabase
        .from("taches")
        .select("id, titre, icone, jour_semaine, assignee, recurrence")
        .eq("coloc_code", monProfil.coloc_code)
        .neq("recurrence", "ponctuelle")
        .eq("archive", false);

      const tachesDetail: MenageTacheDetail[] = (toutesLesTaches ?? []).map((t: any) => ({
        id: t.id,
        titre: t.titre ?? "Tâche",
        icone: t.icone ?? "checkmark-outline",
        jour_semaine: t.jour_semaine ?? null,
      }));
      setMenageTachesAll(tachesDetail);

      const { data: tousLesProfils } = await supabase
        .from("profiles")
        .select("prenom")
        .eq("coloc_code", monProfil.coloc_code)
        .order("prenom");
      const prenoms = (tousLesProfils ?? []).map((p: any) => p.prenom?.trim() ?? "").filter(Boolean);
      setMenagePrenoms(prenoms);

      const { data: allEntries } = await supabase
        .from("tache_semaines")
        .select("id, tache_id, fait, assignee, jour_semaine")
        .eq("coloc_code", monProfil.coloc_code)
        .eq("semaine", semaine);

      const entryMap: Record<string, { id: number; assignee: string; fait: boolean }> = {};
      (allEntries ?? []).forEach((e: any) => {
        entryMap[`${e.tache_id}_${e.jour_semaine ?? 0}`] = { id: e.id, assignee: e.assignee?.trim() ?? "", fait: e.fait };
      });

      const baseMap: Record<number, string> = {};
      (toutesLesTaches ?? []).forEach((t: any) => {
        const firstEntry = (allEntries ?? []).find((e: any) => e.tache_id === t.id);
        baseMap[t.id] = (firstEntry?.assignee?.trim() || t.assignee?.trim() || "").trim();
      });
      setMenageBaseAssignees(baseMap);

      const combined: MenageIndexItem[] = [];
      for (const tache of tachesDetail) {
        const taskBase = (toutesLesTaches ?? []).find((t: any) => t.id === tache.id);
        const jours: (number | null)[] = tache.jour_semaine
          ? tache.jour_semaine.split(",").map(Number).filter((n) => !isNaN(n))
          : [null];

        for (const jour of jours) {
          const entryKey = `${tache.id}_${jour ?? 0}`;
          const entry = entryMap[entryKey];
          const assigneeRaw = (entry?.assignee || taskBase?.assignee?.trim() || "").trim();
          const estMoi = assigneeRaw.toLowerCase() === monProfil.prenom?.trim().toLowerCase();
          combined.push({
            rotationId: entry?.id ?? -(tache.id * 1000 + (jour ?? 0)),
            tacheId: tache.id,
            fait: entry?.fait ?? false,
            assignee: assigneeRaw,
            estMoi,
            titre: tache.titre,
            icone: tache.icone,
            jour_semaine: jour,
            jourNum: jour,
          });
        }
      }
      setMesMenageTaches(combined);

      const evFrom = new Date();
      evFrom.setDate(evFrom.getDate() - 3);
      const evTo = new Date();
      evTo.setDate(evTo.getDate() + 14);
      const { data: evData } = await supabase
        .from("evenements")
        .select("id, titre, date, heure_debut, icone, createur, description, participants")
        .eq("coloc_code", monProfil.coloc_code)
        .gte("date", formatDateISO(evFrom))
        .lte("date", formatDateISO(evTo))
        .order("date");

      const { data: tachesEch } = await supabase
        .from("taches")
        .select("id, titre, echeance, icone, assignee")
        .eq("coloc_code", monProfil.coloc_code)
        .eq("recurrence", "ponctuelle")
        .neq("archive", true)
        .neq("fait", true)
        .gte("echeance", formatDateISO(evFrom))
        .lte("echeance", formatDateISO(evTo));

      const tachesAsEvents: EvenementWidget[] = (tachesEch ?? []).map((t: any) => ({
        id: -(t.id as number),
        titre: t.titre,
        date: t.echeance,
        heure_debut: null,
        icone: t.icone ?? "checkmark-circle-outline",
        createur: null,
        description: null,
        participants: t.assignee ? t.assignee.split(", ").filter(Boolean) : null,
      }));

      const tousItems = [...((evData ?? []) as EvenementWidget[]), ...tachesAsEvents]
        .sort((a, b) => a.date.localeCompare(b.date));
      setEvenementsWidget(tousItems);

      const repasFrom = new Date();
      repasFrom.setDate(repasFrom.getDate() - 1);
      const repasTo = new Date();
      repasTo.setDate(repasTo.getDate() + 7);
      const { data: repasRaw } = await supabase
        .from("repas")
        .select("id, date, moment, titre, cuisinier")
        .eq("coloc_code", monProfil.coloc_code)
        .gte("date", formatDateISO(repasFrom))
        .lte("date", formatDateISO(repasTo));
      setRepasData((repasRaw ?? []) as RepasItem[]);

      const pending = combined.filter((m) => m.estMoi && !m.fait).length;
      setTachesCount((nbTaches || 0) + pending);
    }






    setLoading(false);
  }

  async function chargerMeteo(adresse: string) {
    try {
      const parts = adresse.split(",").map((p) => p.trim()).filter(Boolean);
      const ville = parts[parts.length - 1] || adresse.trim();
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ville)}&count=1&language=fr&format=json`);
      const geoData = await geoRes.json();
      if (!geoData.results?.length) return;
      const { latitude, longitude, name } = geoData.results[0];
      const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
      const wData = await wRes.json();
      const temp = Math.round(wData.current?.temperature_2m ?? 0);
      const code = wData.current?.weather_code ?? 0;
      const tempMax = Math.round(wData.daily?.temperature_2m_max?.[0] ?? temp);
      const tempMin = Math.round(wData.daily?.temperature_2m_min?.[0] ?? temp);
      setMeteo({ temp, tempMin, tempMax, code, ville: name });
    } catch (_) {}
  }


  function getTachesForWeek(offset: number): MenageIndexItem[] {
    if (offset === 0) return mesMenageTaches;

    const monPrenom = profile?.prenom?.trim().toLowerCase() ?? "";
    const nPrenoms = menagePrenoms.length;
    const result: MenageIndexItem[] = [];

    for (const tache of menageTachesAll) {
      const baseAssignee = (menageBaseAssignees[tache.id] ?? "").trim();
      const baseIdx = nPrenoms > 0 ? menagePrenoms.findIndex((p) => p.toLowerCase() === baseAssignee.toLowerCase()) : -1;
      let projAssignee = baseAssignee || (menagePrenoms[0] ?? "");
      if (baseIdx >= 0 && nPrenoms > 0) {
        const projIdx = (((baseIdx + offset) % nPrenoms) + nPrenoms) % nPrenoms;
        projAssignee = menagePrenoms[projIdx];
      }
      const estMoi = projAssignee.toLowerCase() === monPrenom;
      const jours: (number | null)[] = tache.jour_semaine
        ? tache.jour_semaine.split(",").map(Number).filter((n) => !isNaN(n))
        : [null];

      for (const jour of jours) {
        result.push({
          rotationId: -(tache.id * 1000 + Math.abs(offset) * 100 + (jour ?? 0)),
          tacheId: tache.id,
          titre: tache.titre,
          icone: tache.icone,
          fait: false,
          assignee: projAssignee,
          estMoi,
          jour_semaine: jour,
          jourNum: jour,
        });
      }
    }
    return result;
  }

  function getTachesForDay(dayOffset: number): MenageIndexItem[] {
    const todayDow = (new Date().getDay() + 6) % 7;
    const absoluteDay = todayDow + dayOffset;
    const weekOff = Math.floor(absoluteDay / 7);
    const dayOfWeek = ((absoluteDay % 7) + 7) % 7;
    return getTachesForWeek(weekOff).filter(
      (t) => t.jour_semaine === dayOfWeek || (t.jour_semaine === null && dayOffset === 0),
    );
  }

  function getEventsForDay(dayOffset: number): EvenementWidget[] {
    const target = getDateForOffset(dayOffset);
    return evenementsWidget.filter((ev) => ev.date === target);
  }

  return (
    <>
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.monAvatar} onPress={() => router.push("/profil")}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.monAvatarPhoto} />
            ) : (
              <Ionicons name="person-outline" size={24} color="#6366F1" />
            )}
            <View style={styles.onlineDot} />
          </TouchableOpacity>
          <Text style={styles.bonjour}>{profile?.prenom ? getSalutation(profile.prenom) : "Bonjour 👋"}</Text>
          <TouchableOpacity style={styles.hamburgerBtn} onPress={() => setHamburger(true)}>
            <Ionicons name="menu-outline" size={26} color="#6366F1" />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.grid}>
          <TouchableOpacity style={[styles.card, { borderColor: "#6366F1" }]} onPress={() => router.push("/(tabs)/taches")}>
            <Ionicons name="checkmark-circle-outline" size={28} color="#6366F1" style={styles.cardIcon} />
            <Text style={[styles.cardValue, { color: "#6366F1" }]}>{tachesCount}</Text>
            <Text style={styles.cardLabel}>Tâches en attente</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderColor: "#10B981" }]} onPress={() => router.push("/(tabs)/courses")}>
            <Ionicons name="cart-outline" size={28} color="#10B981" style={styles.cardIcon} />
            <Text style={[styles.cardValue, { color: "#10B981" }]}>{articlesCount}</Text>
            <Text style={styles.cardLabel}>Articles à acheter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderColor: "#F59E0B" }]} onPress={() => router.push("/(tabs)/finances")}>
            <Ionicons name="wallet-outline" size={28} color="#F59E0B" style={styles.cardIcon} />
            <Text style={[styles.cardValue, { color: "#F59E0B" }]}>{depensesTotal.toFixed(0)}€</Text>
            <Text style={styles.cardLabel}>Dépenses totales</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.card, { borderColor: "#8B5CF6" }]} onPress={() => router.push("/(tabs)/messages" as any)}>
            <Ionicons name="chatbubbles-outline" size={28} color="#8B5CF6" style={styles.cardIcon} />
            <Text style={[styles.cardValue, { color: "#8B5CF6" }]}>{messagesNonLus}</Text>
            <Text style={styles.cardLabel}>Messages non lus</Text>
          </TouchableOpacity>
        </View>

        {/* Carte colocation */}
        {colocCode ? (
          <TouchableOpacity style={[styles.appartCard, { marginHorizontal: 16, marginBottom: 14 }]} onPress={() => setModalInvit(true)} activeOpacity={0.85}>
            {meteo ? (() => {
              const mi = wmoToIcone(meteo.code);
              return (
                <View style={styles.meteoRow}>
                  <View style={[styles.meteoIconeBox, { backgroundColor: mi.couleur + "20" }]}>
                    <Ionicons name={mi.icone as any} size={15} color={mi.couleur} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.meteoLabel, { color: mi.couleur }]}>{wmoToLabel(meteo.code)} · {meteo.ville}</Text>
                    <Text style={styles.meteoMinMax}>↓ {meteo.tempMin}°  ↑ {meteo.tempMax}°</Text>
                  </View>
                  <Text style={[styles.meteoTemp, { color: mi.couleur }]}>{meteo.temp}°</Text>
                </View>
              );
            })() : null}

            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Text style={[styles.appartNom, { marginBottom: 0 }]}>{nomColoc}</Text>
              {isPro && <Ionicons name="shield-checkmark" size={15} color="#06B6D4" style={{ marginLeft: 6 }} />}
            </View>

            {adresseColoc ? (
              <View style={[styles.appartInfoItem, { marginBottom: 2 }]}>
                <Ionicons name="location-outline" size={13} color="#6366F1" style={{ marginRight: 4 }} />
                <Text style={styles.appartInfoTexte}>{adresseColoc}</Text>
              </View>
            ) : (
              <View style={[styles.appartInfoItem, { marginBottom: 2 }]}>
                <Ionicons name="location-outline" size={13} color="#CBD5E1" style={{ marginRight: 4 }} />
                <Text style={styles.appartInfoHint}>Ajouter l'adresse · Format : Rue, code postal, Ville</Text>
              </View>
            )}

            <View style={[styles.appartInfoRow, { marginBottom: 4 }]}>
              {nbChambres ? (
                <View style={styles.appartInfoItem}>
                  <Ionicons name="bed-outline" size={13} color="#6366F1" style={{ marginRight: 4 }} />
                  <Text style={styles.appartInfoTexte}>{nbChambres} chambre{nbChambres > 1 ? "s" : ""}</Text>
                </View>
              ) : null}
              <View style={styles.appartInfoItem}>
                <Ionicons name="people-outline" size={13} color="#6366F1" style={{ marginRight: 4 }} />
                <Text style={styles.appartInfoTexte}>{colocs.length + 1} colocataire{colocs.length + 1 > 1 ? "s" : ""}</Text>
              </View>
            </View>

            <View style={styles.appartAvatarsRow}>
              {colocs.map((c) => {
                const STATUT_LABEL: Record<string, string> = { present: "Présent", bientot: "Absent bientôt", absent: "Absent" };
                const statutLabel = STATUT_LABEL[c.statut ?? "present"] ?? "Présent";
                const hasNote = !!c.statut_note?.trim();
                const statutCouleur = STATUT_DOT[c.statut ?? "present"] ?? "#94A3B8";
                const corps = hasNote ? `${statutLabel}\n\n${c.statut_note}` : statutLabel;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.appartAvatarItem}
                    activeOpacity={0.7}
                    onPress={(e) => {
                      e.stopPropagation();
                      setModalInfo({ titre: c.prenom, corps, couleur: statutCouleur, icone: STATUT_ICONE[c.statut ?? "present"] ?? "person-outline" });
                    }}
                  >
                    <View style={styles.appartAvatarWrapper}>
                      {c.avatar_url ? (
                        <Image source={{ uri: c.avatar_url }} style={styles.appartAvatarPhoto} />
                      ) : (
                        <View style={styles.appartAvatarDefault}>
                          <Ionicons name="person-outline" size={18} color="#6366F1" />
                        </View>
                      )}
                      <View style={[styles.appartAvatarDot, { backgroundColor: statutCouleur }]} />
                    </View>
                    <Text style={styles.appartAvatarPrenom} numberOfLines={1}>{c.prenom}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.appartAvatarItem} activeOpacity={0.7} onPress={(e) => { e.stopPropagation(); setModalInvit(true); }}>
                <View style={[styles.appartAvatarDefault, { borderWidth: 1.5, borderColor: "#E2E8F0", borderStyle: "dashed" }]}>
                  <Ionicons name="person-add-outline" size={16} color="#94A3B8" />
                </View>
                <Text style={[styles.appartAvatarPrenom, { color: "#94A3B8" }]}>Inviter</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.appartCodeRow}>
              <Ionicons name="qr-code-outline" size={12} color="#A5B4FC" style={{ marginRight: 5 }} />
              <Text style={[styles.appartCodeTexte, { flex: 1 }]}>Code · {colocCode}</Text>
              <TouchableOpacity style={styles.appartGererBtn} onPress={(e) => { e.stopPropagation(); router.push("/colocs" as any); }} activeOpacity={0.7}>
                <Ionicons name="settings-outline" size={11} color="#6366F1" style={{ marginRight: 3 }} />
                <Text style={styles.appartGererTxt}>Gérer</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Banner Hellow+ */}
        <TouchableOpacity style={styles.decouvrirBanner} onPress={() => router.push("/(tabs)/explore" as any)} activeOpacity={0.88}>
          {/* Mini logo H */}
          <View style={styles.decouvrirLogoBox}>
            <View style={styles.decouvrirLogoH}>
              <View style={styles.dLogoLeft} />
              <View style={styles.dLogoRight} />
              <View style={styles.dLogoBarre} />
            </View>
          </View>
          <View style={styles.decouvrirTexts}>
            <Text style={styles.decouvrirTitre}>
              {isPro ? "Hellow+ actif ✨" : "Découvrir Hellow+ ✨"}
            </Text>
            <Text style={styles.decouvrirSous}>
              {isPro ? "Toutes les fonctionnalités débloquées" : "Ménage Pro, Stockage étendu, et plus…"}
            </Text>
          </View>
          <View style={styles.decouvrirChevron}>
            <Ionicons name="chevron-forward-outline" size={14} color="#8B5CF6" />
          </View>
        </TouchableOpacity>

        {/* Écran vide */}
        {!loading && colocs.length === 0 && (
          <View style={styles.welcomeCard}>
            <View style={styles.welcomeIconeWrapper}>
              <Ionicons name="home-outline" size={48} color="#6366F1" />
            </View>
            <Text style={styles.welcomeTitre}>Ta coloc t'attend ! 🏠</Text>
            <Text style={styles.welcomeSous}>Invite tes colocataires pour commencer à utiliser toutes les fonctionnalités ensemble.</Text>
            <View style={styles.welcomeSteps}>
              {[
                { num: "1", icone: "person-add-outline" as const,         couleur: "#6366F1", bg: "#EEF2FF", texte: "Invite tes colocs avec le code" },
                { num: "2", icone: "checkmark-circle-outline" as const,   couleur: "#10B981", bg: "#ECFDF5", texte: "Organisez tâches & planning ensemble" },
                { num: "3", icone: "wallet-outline" as const,             couleur: "#F59E0B", bg: "#FFFBEB", texte: "Partagez les dépenses facilement" },
              ].map((step) => (
                <View key={step.num} style={styles.welcomeStep}>
                  <View style={[styles.welcomeStepIcone, { backgroundColor: step.bg }]}>
                    <Ionicons name={step.icone} size={18} color={step.couleur} />
                  </View>
                  <Text style={styles.welcomeStepTexte}>{step.texte}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.welcomeBtn} onPress={() => router.push("/colocs" as any)} activeOpacity={0.85}>
              <Ionicons name="share-social-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.welcomeBtnTxt}>Inviter mes colocataires</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Widget Repas */}
        <View style={styles.semaineCarte}>
          <View style={styles.semaineHeader}>
            <TouchableOpacity onPress={() => setRepasJourOffset((o) => Math.max(o - 1, -1))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back-outline" size={18} color="#F59E0B" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.semaineHeaderCenter} onPress={() => router.push("/(tabs)/courses")} activeOpacity={0.7}>
              <Ionicons name="restaurant-outline" size={13} color="#F59E0B" style={{ marginRight: 5 }} />
              <Text style={[styles.semaineTitre, { color: "#F59E0B" }]}>{labelJourPourOffset(repasJourOffset)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRepasJourOffset((o) => Math.min(o + 1, 7))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-forward-outline" size={18} color="#F59E0B" />
            </TouchableOpacity>
          </View>

          <View style={styles.semaineSectionHeader}>
            <Ionicons name="restaurant-outline" size={13} color="#F59E0B" style={{ marginRight: 5 }} />
            <Text style={[styles.semaineSectionTitre, { color: "#F59E0B" }]}>Repas</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#F59E0B" style={{ margin: 10 }} />
          ) : (() => {
            const dateStr = getDateForOffset(repasJourOffset);
            const repasJour = repasData.filter((r) => r.date === dateStr);
            const repasMap: Record<string, RepasItem> = {};
            repasJour.forEach((r) => { repasMap[r.moment] = r; });

            if (repasJour.length === 0)
              return (
                <View style={[styles.semaineVideRow, { justifyContent: "space-between" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="restaurant-outline" size={14} color="#CBD5E1" style={{ marginRight: 6 }} />
                    <Text style={styles.semaineVideTexte}>Aucun repas planifié</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push("/(tabs)/courses")}>
                    <Text style={{ fontSize: 11, color: "#F59E0B", fontWeight: "700" }}>Planifier →</Text>
                  </TouchableOpacity>
                </View>
              );

            return MOMENTS_REPAS.map((m) => {
              const r = repasMap[m.key];
              if (!r) return null;
              return (
                <View key={m.key} style={styles.repasLigne}>
                  <View style={[styles.repasIconeBox, { backgroundColor: m.couleur + "18" }]}>
                    <Ionicons name={m.icone} size={13} color={m.couleur} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.repasMoment, { color: m.couleur }]}>{m.label}</Text>
                    <Text style={styles.repasTitre}>{r.titre}</Text>
                  </View>
                  {r.cuisinier ? (
                    <View style={styles.repasCuisinierBadge}>
                      <Ionicons name="person-outline" size={9} color="#6366F1" style={{ marginRight: 2 }} />
                      <Text style={styles.repasCuisinierTxt}>{r.cuisinier}</Text>
                    </View>
                  ) : null}
                </View>
              );
            });
          })()}
        </View>


        {/* Widget Planning */}
        {/* Widget Planning — read-only, 3 items max, "Voir tout →" */}
        <TouchableOpacity
          style={styles.semaineCarte}
          onPress={() => router.push("/(tabs)/taches")}
          activeOpacity={0.92}
        >
          <View style={styles.semaineHeader}>
            <View style={styles.semaineHeaderCenter}>
              <Ionicons name="calendar-outline" size={13} color="#6366F1" style={{ marginRight: 5 }} />
              <Text style={styles.semaineTitre}>Aujourd'hui</Text>
            </View>
            <Text style={styles.planningVoirTout}>Voir tout →</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#8B5CF6" style={{ margin: 10 }} />
          ) : (() => {
            const tachesJour = getTachesForDay(0);
            const evsJour = getEventsForDay(0);
            const items = [...evsJour.map(e => ({ kind: "ev" as const, ev: e })), ...tachesJour.map(t => ({ kind: "tache" as const, tache: t }))];
            const affichees = items.slice(0, 3);
            const reste = items.length - 3;

            if (affichees.length === 0) return (
              <View style={styles.semaineVideRow}>
                <Ionicons name="checkmark-done-outline" size={14} color="#CBD5E1" style={{ marginRight: 6 }} />
                <Text style={styles.semaineVideTexte}>Rien de prévu aujourd'hui 🎉</Text>
              </View>
            );

            return (
              <>
                {affichees.map((item, idx) => {
                  if (item.kind === "ev") {
                    const ev = item.ev;
                    return (
                      <View key={`ev-${ev.id}`} style={styles.semaineEvLigne}>
                        <View style={styles.semaineEvIcone}>
                          <Ionicons name={(ev.icone as any) || "calendar-outline"} size={12} color="#6366F1" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.semaineEvTitre} numberOfLines={1}>{ev.titre}</Text>
                          {ev.heure_debut ? <Text style={styles.semaineEvHeure}>{ev.heure_debut}</Text> : null}
                        </View>
                      </View>
                    );
                  }
                  const t = item.tache;
                  return (
                    <View key={t.rotationId} style={[styles.semaineMenageLigne, t.fait && { opacity: 0.5 }]}>
                      <View style={[styles.semaineMenageIcone, t.fait ? { backgroundColor: "#ECFDF5" } : t.estMoi ? { backgroundColor: "#EDE9FE" } : { backgroundColor: "#F1F5F9" }]}>
                        <Ionicons name={(t.icone as any) || "checkmark-outline"} size={13} color={t.fait ? "#10B981" : t.estMoi ? "#8B5CF6" : "#94A3B8"} />
                      </View>
                      <Text style={[styles.semaineMenageTitre, { flex: 1 }, t.fait && { textDecorationLine: "line-through", color: "#94A3B8" }, !t.estMoi && { color: "#94A3B8", fontWeight: "400" }]} numberOfLines={1}>
                        {t.titre}
                      </Text>
                      <View style={[styles.semaineMenageAssignee, t.estMoi && { backgroundColor: "#EDE9FE" }]}>
                        <Text style={[styles.semaineMenageAssigneeTexte, t.estMoi && { color: "#8B5CF6" }]}>
                          {t.estMoi ? "Moi" : t.assignee}
                        </Text>
                      </View>
                      {/* Statut visuel uniquement — pas de toggle */}
                      <Ionicons name={t.fait ? "checkmark-circle" : "ellipse-outline"} size={18} color={t.fait ? "#10B981" : "#E2E8F0"} style={{ marginLeft: 4 }} />
                    </View>
                  );
                })}
                {reste > 0 && (
                  <Text style={styles.planningResteItems}>+{reste} autre{reste > 1 ? "s" : ""} · voir tout →</Text>
                )}
              </>
            );
          })()}
        </TouchableOpacity>




        {/* Widget Le Quartier */}
        <CommunauteWidget />

        <View style={{ height: Math.max(insets.bottom, 24) }} />
      </ScrollView>

      {/* Modal invitation */}
      <Modal transparent animationType="slide" visible={modalInvit} onRequestClose={() => setModalInvit(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalInvit(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.invitCard}>
            <View style={styles.invitPoignee} />
            <Text style={styles.invitTitre}>Inviter un coloc</Text>
            <Text style={styles.invitSous}>Partagez ce code pour rejoindre {nomColoc}</Text>
            <View style={styles.invitCodeBox}>
              <Text style={styles.invitCode}>{colocCode}</Text>
            </View>
            <TouchableOpacity style={styles.invitPartagerBtn} onPress={async () => {
              const { Share } = await import("react-native");
              setModalInvit(false);
              Share.share({ message: `Tu es invité à rejoindre ma coloc sur Hellow !\n\nhttps://myhellow.app/join?code=${colocCode}\n\nOu entre le code manuellement : ${colocCode}` });
            }}>
              <Ionicons name="share-social-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.invitPartagerTxt}>Partager l'invitation</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalInvit(false)} style={styles.invitFermerBtn}>
              <Text style={styles.invitFermerTxt}>Fermer</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Menu hamburger */}
      <Modal transparent animationType="slide" visible={hamburger} onRequestClose={() => setHamburger(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setHamburger(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.hamburgerSheet}>
            <View style={styles.hamburgerPoignee} />
            <Text style={styles.hamburgerTitre}>Raccourcis</Text>

            {/* Contacts urgence — en premier, visuellement distinct */}
            <TouchableOpacity
              style={[styles.hamburgerItem, styles.hamburgerItemUrgence]}
              onPress={() => { setHamburger(false); router.push("/contacts" as any); }}
            >
              <View style={[styles.hamburgerIcone, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="call-outline" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.hamburgerItemTitre, { color: "#EF4444" }]}>Contacts d'urgence</Text>
                <Text style={styles.hamburgerItemSous}>Numéros utiles & personnes de confiance</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={16} color="#FCA5A5" />
            </TouchableOpacity>

            <View style={styles.hamburgerSep} />

            {[
              { route: "/regles", icone: "list-outline" as const,    bg: "#F0FDF4", couleur: "#10B981", titre: "Règles de la maison",  sous: "Voir et gérer les règles de la coloc" },
              { route: "/agenda", icone: "calendar-outline" as const, bg: "#EEF2FF", couleur: "#6366F1", titre: "Agenda partagé",      sous: "Événements, sorties et rendez-vous" },
              { route: "/colocs", icone: "people-outline" as const,   bg: "#EEF2FF", couleur: "#6366F1", titre: "Gérer la colocation", sous: "Membres, code d'invitation, profil" },
            ].map((item) => (
              <TouchableOpacity key={item.route} style={styles.hamburgerItem} onPress={() => { setHamburger(false); router.push(item.route as any); }}>
                <View style={[styles.hamburgerIcone, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icone} size={20} color={item.couleur} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hamburgerItemTitre}>{item.titre}</Text>
                  <Text style={styles.hamburgerItemSous}>{item.sous}</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={16} color="#CBD5E1" />
              </TouchableOpacity>
            ))}

            <View style={styles.hamburgerSep} />

            {/* Snake — kiff personnel, discret */}
            <TouchableOpacity
              style={styles.hamburgerItem}
              onPress={() => { setHamburger(false); router.push("/snake" as any); }}
            >
              <View style={[styles.hamburgerIcone, { backgroundColor: "#ECFDF5" }]}>
                <Text style={{ fontSize: 20 }}>🐍</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.hamburgerItemTitre}>Snake</Text>
                <Text style={styles.hamburgerItemSous}>Mini-jeu · record de la coloc</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={16} color="#CBD5E1" />
            </TouchableOpacity>

            <View style={styles.hamburgerSep} />

            {/* Découvrir — en bas, c'est de la promo */}
            <TouchableOpacity
              style={styles.hamburgerItem}
              onPress={() => { setHamburger(false); router.push("/(tabs)/explore" as any); }}
            >
              <View style={[styles.hamburgerIcone, { backgroundColor: "#EDE9FE" }]}>
                <Ionicons name="rocket-outline" size={20} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.hamburgerItemTitre, { color: "#7C3AED" }]}>Découvrir Hellow+ ✨</Text>
                <Text style={styles.hamburgerItemSous}>Fonctionnalités avancées & mini-programmes</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={16} color="#C4B5FD" />
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal info custom */}
      <Modal transparent animationType="fade" visible={!!modalInfo} onRequestClose={() => setModalInfo(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalInfo(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalBox, { borderColor: (modalInfo?.couleur ?? "#6366F1") + "45" }]}>
            <View style={[styles.modalHeader, { backgroundColor: (modalInfo?.couleur ?? "#6366F1") + "12" }]}>
              <View style={[styles.modalIconeWrapper, { backgroundColor: (modalInfo?.couleur ?? "#6366F1") + "20" }]}>
                <Ionicons name={(modalInfo?.icone as any) ?? "information-circle-outline"} size={18} color={modalInfo?.couleur ?? "#6366F1"} />
              </View>
              <Text style={[styles.modalTitre, { color: modalInfo?.couleur ?? "#6366F1" }]}>{modalInfo?.titre}</Text>
            </View>
            {!!modalInfo?.corps?.trim() && <Text style={styles.modalCorps}>{modalInfo?.corps}</Text>}
            <TouchableOpacity style={[styles.modalFermerBtn, { backgroundColor: (modalInfo?.couleur ?? "#6366F1") + "15" }]} onPress={() => setModalInfo(null)}>
              <Text style={[styles.modalFermerTxt, { color: modalInfo?.couleur ?? "#6366F1" }]}>Fermer</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  monAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "#6366F1", overflow: "visible" },
  monAvatarPhoto: { width: 48, height: 48, borderRadius: 24 },
  onlineDot: { position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: "#10B981", borderWidth: 2, borderColor: "#F8FAFC" },
  bonjour: { fontSize: 15, fontWeight: "700", color: "#1E293B", flex: 1, textAlign: "center" },
  hamburgerBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },

  hamburgerSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  hamburgerItemUrgence: {
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    marginBottom: 4,
  },
  hamburgerPoignee: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 18 },
  hamburgerTitre: { fontSize: 13, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12, paddingHorizontal: 4 },
  hamburgerItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  hamburgerIcone: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  hamburgerItemTitre: { fontSize: 14, fontWeight: "700", color: "#1E293B", marginBottom: 1 },
  hamburgerItemSous: { fontSize: 12, color: "#94A3B8" },
  hamburgerSep: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 6 },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, marginBottom: 14, gap: 10 },
  card: { width: "47%", backgroundColor: "#fff", borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardIcon: { marginBottom: 6 },
  cardValue: { fontSize: 22, fontWeight: "800", marginBottom: 2 },
  cardLabel: { fontSize: 11, color: "#94A3B8", textAlign: "center", fontWeight: "500" },

  decouvrirBanner: { marginHorizontal: 16, marginBottom: 14, backgroundColor: "#F5F3FF", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#DDD6FE" },
  // Logo H mini
  decouvrirLogoBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#1E1B4B", alignItems: "center", justifyContent: "center", marginRight: 12, position: "relative" },
  decouvrirLogoH: { width: 28, height: 28, position: "relative" },
  dLogoLeft:  { position: "absolute", left: 3,  top: 2, width: 7, height: 24, borderRadius: 2, backgroundColor: "#fff" },
  dLogoRight: { position: "absolute", right: 3, top: 2, width: 7, height: 24, borderRadius: 2, backgroundColor: "#fff" },
  dLogoBarre: { position: "absolute", left: 3,  top: 9, width: 22, height: 7, borderRadius: 2, backgroundColor: "#fff" },
  decouvrirTexts: { flex: 1 },
  decouvrirTitre: { fontSize: 14, fontWeight: "800", color: "#4C1D95", marginBottom: 2 },
  decouvrirSous: { fontSize: 11, color: "#7C3AED", lineHeight: 15 },
  decouvrirChevron: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center", marginLeft: 8 },

  appartCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#6366F1", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  appartNom: { fontSize: 16, fontWeight: "800", color: "#1E293B", marginBottom: 6 },
  appartInfoRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  appartInfoItem: { flexDirection: "row", alignItems: "center" },
  appartInfoTexte: { fontSize: 12, color: "#64748B" },
  appartInfoHint: { fontSize: 11, color: "#CBD5E1", fontStyle: "italic" },
  appartCodeRow: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  appartCodeTexte: { fontSize: 11, color: "#A5B4FC" },
  appartGererBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF2FF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  appartGererTxt: { fontSize: 11, color: "#6366F1", fontWeight: "700" },
  appartAvatarsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F1F5F9", marginBottom: 4 },
  appartAvatarItem: { alignItems: "center", gap: 3 },
  appartAvatarWrapper: { position: "relative" },
  appartAvatarPhoto: { width: 42, height: 42, borderRadius: 21 },
  appartAvatarDefault: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  appartAvatarDot: { position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: "#fff" },
  appartAvatarPrenom: { fontSize: 10, color: "#334155", fontWeight: "600", maxWidth: 48, textAlign: "center" },

  welcomeCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: "#fff", borderRadius: 20, padding: 24, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  welcomeIconeWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  welcomeTitre: { fontSize: 20, fontWeight: "800", color: "#1E293B", marginBottom: 8, textAlign: "center" },
  welcomeSous: { fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 19, marginBottom: 20 },
  welcomeSteps: { width: "100%", gap: 10, marginBottom: 20 },
  welcomeStep: { flexDirection: "row", alignItems: "center", gap: 12 },
  welcomeStepIcone: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  welcomeStepTexte: { fontSize: 13, color: "#334155", flex: 1 },
  welcomeBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#6366F1", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: "100%", justifyContent: "center" },
  welcomeBtnTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },

  semaineCarte: { marginHorizontal: 16, marginBottom: 14, backgroundColor: "#fff", borderRadius: 16, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  semaineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  semaineHeaderCenter: { flexDirection: "row", alignItems: "center", flex: 1, justifyContent: "center" },
  semaineTitre: { fontSize: 13, fontWeight: "700", color: "#6366F1" },
  semaineSectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  semaineSectionTitre: { fontSize: 11, fontWeight: "700", color: "#6366F1", textTransform: "uppercase", letterSpacing: 0.5 },
  semaineSectionCompte: { fontSize: 10, color: "#94A3B8", marginLeft: "auto" },
  semaineMenageLigne: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 },
  semaineMenageIcone: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  semaineMenageTitre: { fontSize: 13, color: "#334155", fontWeight: "600" },
  semaineMenageAssignee: { backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  semaineMenageAssigneeTexte: { fontSize: 10, color: "#64748B", fontWeight: "600" },
  semaineVideRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  semaineVideTexte: { fontSize: 12, color: "#CBD5E1" },
  semaineEvLigne: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 },
  semaineEvIcone: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  semaineEvTitre: { fontSize: 13, color: "#334155", fontWeight: "600" },
  semaineEvHeure: { fontSize: 11, color: "#6366F1", fontWeight: "600" },
  semaineEvCreateur: { backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  semaineEvCreateurTxt: { fontSize: 10, color: "#64748B", fontWeight: "600" },
  planningAgendaLien: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingTop: 10, paddingBottom: 2, borderTopWidth: 1, borderTopColor: "#F1F5F9", marginTop: 8 },
  planningAgendaLienTxt: { fontSize: 12, color: "#6366F1", fontWeight: "600" },
  planningVoirTout: { fontSize: 12, color: "#6366F1", fontWeight: "600" },
  planningResteItems: { fontSize: 11, color: "#94A3B8", marginTop: 6, textAlign: "center", fontStyle: "italic" },

  repasLigne: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 },
  repasIconeBox: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  repasMoment: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  repasTitre: { fontSize: 13, color: "#334155", fontWeight: "600", marginTop: 1 },
  repasCuisinierBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF2FF", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  repasCuisinierTxt: { fontSize: 10, color: "#6366F1", fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  invitCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  invitPoignee: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 18 },
  invitTitre: { fontSize: 18, fontWeight: "800", color: "#1E293B", marginBottom: 6, textAlign: "center" },
  invitSous: { fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 16 },
  invitCodeBox: { backgroundColor: "#EEF2FF", borderRadius: 14, paddingHorizontal: 24, paddingVertical: 16, marginBottom: 18, alignSelf: "center" },
  invitCode: { fontSize: 28, fontWeight: "800", color: "#6366F1", letterSpacing: 4 },
  invitPartagerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#6366F1", borderRadius: 14, paddingVertical: 14, marginBottom: 10 },
  invitPartagerTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },
  invitFermerBtn: { alignItems: "center", paddingVertical: 10 },
  invitFermerTxt: { fontSize: 14, color: "#94A3B8" },

  modalBox: { backgroundColor: "#fff", borderRadius: 20, margin: 24, padding: 20, borderWidth: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 12, marginBottom: 14, gap: 10 },
  modalIconeWrapper: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalTitre: { fontSize: 17, fontWeight: "800" },
  modalCorps: { fontSize: 14, color: "#334155", lineHeight: 20, marginBottom: 16 },
  modalFermerBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modalFermerTxt: { fontSize: 14, fontWeight: "700" },


  meteoRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 8 },
  meteoIconeBox: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  meteoLabel: { fontSize: 12, fontWeight: "700", marginBottom: 1 },
  meteoMinMax: { fontSize: 10, color: "#94A3B8" },
  meteoTemp: { fontSize: 26, fontWeight: "800" },

});
