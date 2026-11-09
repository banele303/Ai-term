"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Briefcase,
  PhoneCall,
  Mail,
  Building2,
  Car,
  FileText,
  Send,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Upload,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  Table as TableIcon,
  MessageSquare,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/sonner";
import PipelineBoard from "./PipelineBoard";

type PipelineStage =
  | "NEW_LEAD"
  | "CONTACTED"
  | "QUOTE_SENT"
  | "FINANCE_APP"
  | "BANK_SUBMITTED"
  | "CLOSED_WON";

const PIPELINE_STAGES: {
  id: PipelineStage;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
}[] = [
  {
    id: "NEW_LEAD",
    label: "New Lead",
    shortLabel: "Lead",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    dotClass: "bg-sky-400",
  },
  {
    id: "CONTACTED",
    label: "Contacted",
    shortLabel: "Contacted",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    dotClass: "bg-emerald-400",
  },
  {
    id: "QUOTE_SENT",
    label: "Quote Sent",
    shortLabel: "Quoted",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    dotClass: "bg-indigo-400",
  },
  {
    id: "FINANCE_APP",
    label: "Finance Dossier",
    shortLabel: "Finance",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dotClass: "bg-amber-400",
  },
  {
    id: "BANK_SUBMITTED",
    label: "Submitted to Bank",
    shortLabel: "At Bank",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    dotClass: "bg-purple-400",
  },
  {
    id: "CLOSED_WON",
    label: "Closed Won",
    shortLabel: "Won",
    badgeClass: "bg-emerald-600/25 text-emerald-200 border-emerald-400/50",
    dotClass: "bg-emerald-300",
  },
];

const FICA_DOCUMENT_TYPES = [
  { code: "ID_COPY", label: "SA ID Copy (Smart ID / Book)" },
  { code: "DRIVERS_LICENSE", label: "Valid SA Driver's License" },
  { code: "BANK_STATEMENTS", label: "3 Months Stamped Bank Statements" },
  { code: "PAYSLIPS", label: "Latest 3 Months Payslips" },
  { code: "PROOF_OF_ADDRESS", label: "Proof of Residence (< 3 Months)" },
];

const BANK_OPTIONS = [
  { label: "WesBank Vehicle Finance", email: "applications@wesbank.co.za" },
  { label: "MFC (Nedbank Motor Finance)", email: "mfc@nedbank.co.za" },
  { label: "Absa Vehicle & Asset Finance", email: "vehiclefinance@absa.co.za" },
  { label: "Standard Bank Stannic", email: "stannic@standardbank.co.za" },
  { label: "Capitec Business / Asset Finance", email: "business@capitecbank.co.za" },
  { label: "AutoFame Desk Copy (alexsouthflow3@gmail.com)", email: "alexsouthflow3@gmail.com" },
];

export default function DealershipCrmPage() {
  // ── 1. CONVEX FULL-STACK QUERIES & MUTATIONS ──
  const crmWorkspace = useQuery(api.crm.getCrmWorkspace);
  const upsertCrmContact = useMutation(api.crm.upsertCrmContact);
  const saveFinanceApplication = useMutation(api.agent.saveFinanceApplicationFromChat);
  const generateUploadUrl = useMutation(api.agent.generateUploadUrl);
  const resolveStorageUrl = useMutation(api.agent.resolveStorageUrl);
  const logCrmEvent = useMutation(api.agent.logCrmEvent);

  const realCars = useMemo(() => crmWorkspace?.cars || [], [crmWorkspace?.cars]);
  const convexCrmContacts = useMemo(
    () => crmWorkspace?.crmContacts || [],
    [crmWorkspace?.crmContacts]
  );

  // ── 2. UI NAVIGATION & ZERO-SCROLL PAGINATION STATE ──
  const [waSyncedContacts, setWaSyncedContacts] = useState<any[]>([]);
  const [customLocalContacts, setCustomLocalContacts] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<"inbox" | "pipeline" | "directory">("inbox");
  const [workspaceTab, setWorkspaceTab] = useState<"chat" | "dossier">("chat");
  const [contactFilter, setContactFilter] = useState<"recent" | "all" | "finance">("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactKey, setSelectedContactKey] = useState<string>("");

  // Zero-scroll pagination for left contact sidebar & directory table
  const [sidebarPage, setSidebarPage] = useState(0);
  const [directoryPage, setDirectoryPage] = useState(0);
  const SIDEBAR_PAGE_SIZE = 8;
  const DIRECTORY_PAGE_SIZE = 9;

  // Add Contact Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addStage, setAddStage] = useState<PipelineStage>("CONTACTED");
  const [addCarId, setAddCarId] = useState<number | undefined>(undefined);
  const [addNotes, setAddNotes] = useState("");

  // Omnichannel Message Composer
  const [composerChannel, setComposerChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [composerText, setComposerText] = useState("");
  const [emailSubject, setEmailSubject] = useState(
    "AutoFame Dealership Johannesburg South — Official Quotation & Finance"
  );
  const [sendingMessage, setSendingMessage] = useState(false);
  const [contactChatHistory, setContactChatHistory] = useState<
    Record<string, { id: string; sender: string; text: string; time: string; fromMe: boolean }[]>
  >({});

  // Customer 360 Finance Application Dossier & Bank Dispatch
  const [finFirstName, setFinFirstName] = useState("");
  const [finLastName, setFinLastName] = useState("");
  const [finIdNumber, setFinIdNumber] = useState("");
  const [finPhone, setFinPhone] = useState("");
  const [finEmail, setFinEmail] = useState("");
  const [finAddress, setFinAddress] = useState("Johannesburg, Gauteng");
  const [finEmployerName, setFinEmployerName] = useState("");
  const [finJobTitle, setFinJobTitle] = useState("");
  const [finMonthlyIncome, setFinMonthlyIncome] = useState<number>(0);
  const [finMonthlyExpenses, setFinMonthlyExpenses] = useState<number>(0);
  const [finCarId, setFinCarId] = useState<number | undefined>(undefined);
  const [finCarName, setFinCarName] = useState("");
  const [finCarPrice, setFinCarPrice] = useState<number>(0);
  const [finDeposit, setFinDeposit] = useState<number>(0);
  const [finTermMonths] = useState<number>(72);
  const [finNotes, setFinNotes] = useState("");
  const [finProofDocs, setFinProofDocs] = useState<
    Record<
      string,
      {
        docType: string;
        originalName: string;
        mime: string;
        size: number;
        url: string;
      }
    >
  >({});
  const [bankRecipientEmail, setBankRecipientEmail] = useState("applications@wesbank.co.za");
  const [activeDocUploadCode, setActiveDocUploadCode] = useState<string>("ID_COPY");
  const proofDocInputRef = useRef<HTMLInputElement>(null);

  const fetchWhatsAppDirectory = async () => {
    try {
      const res = await fetch("/api/whatsapp?action=messages");
      const data = await res.json();
      if (res.ok && Array.isArray(data.contacts)) {
        setWaSyncedContacts(data.contacts);
      }
    } catch {}
  };

  useEffect(() => {
    fetchWhatsAppDirectory();
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("autofame_custom_wa_contacts");
        if (raw) setCustomLocalContacts(JSON.parse(raw));
      } catch {}
    }
  }, []);

  // Merge Convex CRM contacts + Custom Local Contacts + Synced Whapi Contacts
  const masterContacts = useMemo(() => {
    const map = new Map<string, any>();

    waSyncedContacts.forEach((c, idx) => {
      const key = String(c.id || c.phone).replace(/\D/g, "") || c.id;
      const defaultStage: PipelineStage =
        c.name?.includes("Martha") || c.lastMessage?.includes("Bank:")
          ? "FINANCE_APP"
          : c.lastMessage?.includes("cost how much")
          ? "QUOTE_SENT"
          : c.isRecentChat
          ? "CONTACTED"
          : "NEW_LEAD";

      map.set(key, {
        contactKey: key,
        chatId: c.chatId || `${key}@s.whatsapp.net`,
        name: c.name || c.phone,
        phone: c.phone || `+${key}`,
        email: "",
        idNumber: "",
        address: "Johannesburg, Gauteng",
        employerName: c.name?.includes("Martha")
          ? "West Bulk Bags (Capitec: 2558165883)"
          : "",
        jobTitle: "",
        monthlyIncomeGross: 0,
        monthlyExpenses: 0,
        stage: defaultStage,
        priority: c.isRecentChat ? "HOT" : "NORMAL",
        source: "WHATSAPP",
        assignedCarId: realCars[idx % Math.max(realCars.length, 1)]?.id,
        assignedCarName: realCars[idx % Math.max(realCars.length, 1)]
          ? `${realCars[idx % realCars.length].year} ${realCars[idx % realCars.length].make} ${
              realCars[idx % realCars.length].model
            }`
          : "2024 Toyota Rumion 1.5 SX Auto",
        dealValueZar: realCars[idx % Math.max(realCars.length, 1)]?.price || 249900,
        depositZar: Math.round(
          (realCars[idx % Math.max(realCars.length, 1)]?.price || 249900) * 0.1
        ),
        lastMessage: c.lastMessage || "Saved WhatsApp Contact",
        lastContactedLabel: c.lastContactedLabel || (c.isRecentChat ? "Recent" : "Phonebook"),
        lastContactedAt: c.timestamp || "2026-10-18T08:00:00.000Z",
        isRecentChat: Boolean(c.isRecentChat || c.lastContactedLabel),
        notes: "",
        ficaDocsCount: 0,
        sortOrder: idx,
      });
    });

    customLocalContacts.forEach((c) => {
      const key = String(c.id || c.phone).replace(/\D/g, "") || c.id;
      const existing = map.get(key) || {};
      map.set(key, {
        ...existing,
        contactKey: key,
        chatId: c.chatId || `${key}@s.whatsapp.net`,
        name: c.name || existing.name || c.phone,
        phone: c.phone || existing.phone || `+${key}`,
        stage: c.stage || existing.stage || "CONTACTED",
        priority: "HOT",
        source: "WHATSAPP",
        lastMessage: c.lastMessage || existing.lastMessage || "Added Contact",
        lastContactedLabel: c.lastContactedLabel || "Just Added",
        lastContactedAt: c.timestamp || new Date().toISOString(),
        isRecentChat: true,
        sortOrder: -10,
      });
    });

    convexCrmContacts.forEach((c: any) => {
      const key = c.contactKey;
      const existing = map.get(key) || {};
      const validStage = PIPELINE_STAGES.some((s) => s.id === c.stage)
        ? c.stage
        : "FINANCE_APP";
      map.set(key, {
        ...existing,
        ...c,
        stage: validStage,
        isRecentChat: c.isRecentChat ?? existing.isRecentChat ?? true,
        sortOrder: -20,
      });
    });

    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.isRecentChat && !b.isRecentChat) return -1;
      if (!a.isRecentChat && b.isRecentChat) return 1;
      if (a.isRecentChat && b.isRecentChat) {
        return String(b.lastContactedAt || "").localeCompare(String(a.lastContactedAt || ""));
      }
      return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
    });

    return list;
  }, [waSyncedContacts, customLocalContacts, convexCrmContacts, realCars]);

  useEffect(() => {
    if (!selectedContactKey && masterContacts.length > 0) {
      const preferred =
        masterContacts.find((c) => c.name?.includes("Martha")) ||
        masterContacts[1] ||
        masterContacts[0];
      if (preferred) {
        handleSelectContact(preferred);
      }
    }
  }, [masterContacts, selectedContactKey]);

  const selectedContact = useMemo(
    () =>
      masterContacts.find((c) => c.contactKey === selectedContactKey) ||
      masterContacts[0] ||
      null,
    [masterContacts, selectedContactKey]
  );

  const handleSelectContact = (contact: any) => {
    if (!contact) return;
    setSelectedContactKey(contact.contactKey);
    const cleanName = String(contact.name || "")
      .replace(/\(.*?\)/g, "")
      .trim();
    const parts = cleanName.split(/\s+/);
    const first = parts[0] || "Client";
    const last = parts.slice(1).join(" ") || "";

    setFinFirstName(first);
    setFinLastName(last);
    setFinPhone(contact.phone || "");
    setFinEmail(contact.email || "");
    setFinIdNumber(contact.idNumber || "");
    setFinAddress(contact.address || "Johannesburg, Gauteng");
    setFinEmployerName(contact.employerName || "");
    setFinJobTitle(contact.jobTitle || "");
    setFinMonthlyIncome(contact.monthlyIncomeGross || 0);
    setFinMonthlyExpenses(contact.monthlyExpenses || 0);

    const assignedCar =
      realCars.find((c: any) => c.id === contact.assignedCarId) || realCars[0];
    const carLabel =
      contact.assignedCarName ||
      (assignedCar
        ? `${assignedCar.year} ${assignedCar.make} ${assignedCar.model}`
        : "2024 Toyota Rumion 1.5 SX Auto");
    const carPrice = Number(contact.dealValueZar || assignedCar?.price || 249900);

    setFinCarId(assignedCar?.id);
    setFinCarName(carLabel);
    setFinCarPrice(carPrice);
    setFinDeposit(Number(contact.depositZar || Math.round(carPrice * 0.1)));
    setFinNotes(contact.notes || "");

    setComposerText(
      `Hi ${first}, this is AutoFame Dealership Johannesburg South (+27 63 199 5124). Following up regarding the ${carLabel} (R${carPrice.toLocaleString()} ZAR). Would you like us to send the official quotation or open your vehicle finance application?`
    );
  };

  const filteredContacts = useMemo(() => {
    return masterContacts.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.lastMessage?.toLowerCase().includes(q) ||
          c.assignedCarName?.toLowerCase().includes(q)
        );
      }
      if (contactFilter === "recent") return Boolean(c.isRecentChat);
      if (contactFilter === "finance")
        return c.stage === "FINANCE_APP" || c.stage === "BANK_SUBMITTED";
      return true;
    });
  }, [masterContacts, searchQuery, contactFilter]);

  useEffect(() => {
    setSidebarPage(0);
    setDirectoryPage(0);
  }, [searchQuery, contactFilter]);

  const totalSidebarPages = Math.max(
    1,
    Math.ceil(filteredContacts.length / SIDEBAR_PAGE_SIZE)
  );
  const pagedSidebarContacts = filteredContacts.slice(
    sidebarPage * SIDEBAR_PAGE_SIZE,
    (sidebarPage + 1) * SIDEBAR_PAGE_SIZE
  );

  const totalDirectoryPages = Math.max(
    1,
    Math.ceil(filteredContacts.length / DIRECTORY_PAGE_SIZE)
  );
  const pagedDirectoryContacts = filteredContacts.slice(
    directoryPage * DIRECTORY_PAGE_SIZE,
    (directoryPage + 1) * DIRECTORY_PAGE_SIZE
  );

  const handleCreateContact = async () => {
    if (!addPhone.trim()) {
      toast.error("Please enter a WhatsApp / phone number.");
      return;
    }
    const cleanDigits = addPhone.replace(/\D/g, "");
    const normalizedKey =
      cleanDigits.startsWith("0") && cleanDigits.length === 10
        ? "27" + cleanDigits.slice(1)
        : cleanDigits;
    const displayPhone = addPhone.startsWith("+")
      ? addPhone.trim()
      : `+${normalizedKey}`;
    const chosenCar = realCars.find((c: any) => c.id === addCarId) || realCars[0];
    const carName = chosenCar
      ? `${chosenCar.year} ${chosenCar.make} ${chosenCar.model}`
      : "Selected Vehicle";
    const carPrice = chosenCar?.price || 249900;

    try {
      await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_contact",
          name: addName.trim() || displayPhone,
          phone: displayPhone,
          message: addNotes.trim() || `Interested in ${carName}`,
        }),
      });

      await upsertCrmContact({
        contactKey: normalizedKey,
        chatId: `${normalizedKey}@s.whatsapp.net`,
        name: addName.trim() || displayPhone,
        phone: displayPhone,
        email: addEmail.trim(),
        stage: addStage,
        priority: "HOT",
        source: "WHATSAPP",
        assignedCarId: chosenCar?.id,
        assignedCarName: carName,
        dealValueZar: carPrice,
        depositZar: Math.round(carPrice * 0.1),
        lastMessage: addNotes.trim() || `Added to CRM — ${carName}`,
        lastContactedLabel: "Just Now",
        lastContactedAt: new Date().toISOString(),
        isRecentChat: true,
        notes: addNotes.trim(),
      });

      const localEntry = {
        id: normalizedKey,
        chatId: `${normalizedKey}@s.whatsapp.net`,
        name: addName.trim() || displayPhone,
        phone: displayPhone,
        stage: addStage,
        lastMessage: addNotes.trim() || `Added to CRM — ${carName}`,
        lastContactedLabel: "Just Now",
        timestamp: new Date().toISOString(),
        isRecentChat: true,
      };
      const nextLocal = [
        localEntry,
        ...customLocalContacts.filter((c) => c.id !== normalizedKey),
      ];
      setCustomLocalContacts(nextLocal);
      if (typeof window !== "undefined") {
        localStorage.setItem("autofame_custom_wa_contacts", JSON.stringify(nextLocal));
      }

      setSelectedContactKey(normalizedKey);
      setShowAddModal(false);
      setAddName("");
      setAddPhone("");
      setAddEmail("");
      setAddNotes("");
      toast.success(`Saved ${localEntry.name} to AutoFame CRM`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save contact");
    }
  };

  const handleStageChange = async (contact: any, nextStage: PipelineStage) => {
    try {
      await upsertCrmContact({
        contactKey: contact.contactKey,
        chatId: contact.chatId,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        stage: nextStage,
        priority: contact.priority || "HOT",
        source: contact.source || "WHATSAPP",
        assignedCarId: contact.assignedCarId,
        assignedCarName: contact.assignedCarName,
        dealValueZar: contact.dealValueZar,
        depositZar: contact.depositZar,
        lastMessage: contact.lastMessage,
        lastContactedLabel: contact.lastContactedLabel || "Updated",
        lastContactedAt: new Date().toISOString(),
        isRecentChat: true,
        notes: contact.notes,
      });
      toast.success(
        `Moved ${contact.name} to ${
          PIPELINE_STAGES.find((s) => s.id === nextStage)?.label || nextStage
        }`
      );
    } catch (err: any) {
      toast.error(err.message || "Could not update stage");
    }
  };

  // Drag & drop pipeline: persist stage + position (fractional pipelineOrder)
  const handlePipelineMove = async (
    contact: any,
    nextStage: string,
    pipelineOrder: number
  ) => {
    const base = {
      contactKey: contact.contactKey,
      chatId: contact.chatId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      stage: nextStage,
      priority: contact.priority || "HOT",
      source: contact.source || "WHATSAPP",
      assignedCarId: contact.assignedCarId,
      assignedCarName: contact.assignedCarName,
      dealValueZar: contact.dealValueZar,
      depositZar: contact.depositZar,
      lastMessage: contact.lastMessage,
      lastContactedLabel: contact.lastContactedLabel || "Updated",
      lastContactedAt: contact.lastContactedAt,
      isRecentChat: contact.isRecentChat ?? true,
      notes: contact.notes,
    };
    try {
      await upsertCrmContact({ ...base, pipelineOrder });
    } catch (err: any) {
      // Backend not yet redeployed with pipelineOrder support — still persist the stage.
      if (String(err?.message || "").includes("pipelineOrder")) {
        await upsertCrmContact(base);
      } else {
        throw err;
      }
    }
  };

  const handlePriorityChange = async (contact: any, priority: string) => {
    await upsertCrmContact({
      contactKey: contact.contactKey,
      chatId: contact.chatId,
      name: contact.name,
      phone: contact.phone,
      stage: contact.stage,
      priority,
      lastContactedAt: contact.lastContactedAt,
    });
  };

  const handleSendOmnichannelMessage = async () => {
    if (!selectedContact || !composerText.trim()) return;
    setSendingMessage(true);
    try {
      if (composerChannel === "whatsapp") {
        const res = await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            to:
              selectedContact.chatId === "120363413508068515@g.us"
                ? selectedContact.chatId
                : selectedContact.phone,
            customerName: selectedContact.name,
            message: composerText.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "WhatsApp send failed");

        if (data.trialQuotaExceeded && data.waMeUrl && typeof window !== "undefined") {
          window.open(data.waMeUrl, "_blank", "noopener,noreferrer");
        }

        setContactChatHistory((prev) => {
          const list = prev[selectedContact.contactKey] || [];
          return {
            ...prev,
            [selectedContact.contactKey]: [
              ...list.slice(-1),
              {
                id: `msg-${Date.now()}`,
                sender: "AutoFame Dealership",
                text: composerText.trim(),
                time: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                fromMe: true,
              },
            ],
          };
        });

        await upsertCrmContact({
          contactKey: selectedContact.contactKey,
          chatId: selectedContact.chatId,
          name: selectedContact.name,
          phone: selectedContact.phone,
          stage:
            selectedContact.stage === "NEW_LEAD" ? "CONTACTED" : selectedContact.stage,
          lastMessage: composerText.trim().slice(0, 140),
          lastContactedLabel: "Just Now",
          lastContactedAt: new Date().toISOString(),
          isRecentChat: true,
        });

        await logCrmEvent({
          eventType: "WHATSAPP_SENT",
          recipient: selectedContact.phone,
          customerName: selectedContact.name,
          summary: `CRM WhatsApp sent to ${selectedContact.name}`,
          status: "SUCCESS",
        });

        toast.success(`Sent WhatsApp message to ${selectedContact.name}`);
      } else {
        const targetEmail =
          finEmail.trim() || selectedContact.email || "alexsouthflow3@gmail.com";
        const res = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            fromEmail: "alexsouthflow3@gmail.com",
            appPassword: "dmjjjsyxcpqpdwlb",
            to: targetEmail,
            subject: emailSubject,
            body: composerText.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Email dispatch failed");

        toast.success(`Sent official email to ${targetEmail}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleExtractFromWhatsAppToDossier = async () => {
    if (!selectedContact) return;
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "extract_contact_and_submit",
          query: `take all information from ${selectedContact.name} ${selectedContact.phone}`,
          context: { cars: realCars },
        }),
      });
      const data = await res.json();
      if (res.ok && data.intake) {
        const intake = data.intake;
        if (intake.firstName) setFinFirstName(intake.firstName);
        if (intake.lastName) setFinLastName(intake.lastName);
        if (intake.phone) setFinPhone(intake.phone);
        if (intake.email) setFinEmail(intake.email);
        if (intake.idNumber) setFinIdNumber(intake.idNumber);
        if (intake.employerName) setFinEmployerName(intake.employerName);
        if (intake.monthlyIncomeGross > 0) setFinMonthlyIncome(intake.monthlyIncomeGross);
        if (Array.isArray(intake.documents) && intake.documents.length > 0) {
          setFinProofDocs((prev) => {
            const next = { ...prev };
            intake.documents.forEach((d: any) => {
              next[d.docType] = d;
            });
            return next;
          });
        }
        toast.success(`Extracted chat & banking details from ${selectedContact.name}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Extraction failed");
    }
  };

  const handleUploadProofDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const postUrl = await generateUploadUrl();
      const uploadRes = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const { storageId } = await uploadRes.json();
      const publicUrl = await resolveStorageUrl({ storageId });

      setFinProofDocs((prev) => ({
        ...prev,
        [activeDocUploadCode]: {
          docType: activeDocUploadCode,
          originalName: file.name,
          mime: file.type || "application/pdf",
          size: file.size,
          url: publicUrl || "",
        },
      }));
      toast.success(`Uploaded ${file.name} (${activeDocUploadCode})`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      e.target.value = "";
    }
  };

  const missingFinanceItems = useMemo(() => {
    const missing: string[] = [];
    if (!finFirstName.trim() || !finLastName.trim()) missing.push("Full Name & Surname");
    if (!finIdNumber.trim()) missing.push("13-Digit SA ID Number");
    if (!finPhone.trim()) missing.push("WhatsApp / Mobile Number");
    if (!finCarName.trim() || finCarPrice <= 0) missing.push("Selected Vehicle & Price");
    if (!finEmployerName.trim()) missing.push("Employer / Business Name");
    if (finMonthlyIncome <= 0) missing.push("Gross Monthly Income");
    FICA_DOCUMENT_TYPES.forEach((doc) => {
      if (!finProofDocs[doc.code]) {
        missing.push(doc.label);
      }
    });
    return missing;
  }, [
    finFirstName,
    finLastName,
    finIdNumber,
    finPhone,
    finCarName,
    finCarPrice,
    finEmployerName,
    finMonthlyIncome,
    finProofDocs,
  ]);

  const handleSaveDossierAndSubmitToBank = async (sendEmailToBank: boolean) => {
    if (!selectedContact) return;
    try {
      const docsArray = Object.values(finProofDocs);
      await saveFinanceApplication({
        firstName: finFirstName.trim() || "Client",
        lastName: finLastName.trim() || "Applicant",
        email: finEmail.trim() || "client@autofame.co.za",
        phone: finPhone.trim() || selectedContact.phone,
        idNumber: finIdNumber.trim(),
        address: finAddress.trim(),
        carId: finCarId,
        carName: finCarName,
        carPrice: Number(finCarPrice) || 0,
        downPaymentAmount: Number(finDeposit) || 0,
        loanAmount: Math.max((Number(finCarPrice) || 0) - (Number(finDeposit) || 0), 0),
        termMonths: Number(finTermMonths) || 72,
        employmentStatus: "EMPLOYED",
        employerName: finEmployerName.trim(),
        jobTitle: finJobTitle.trim(),
        monthlyIncomeGross: Number(finMonthlyIncome) || 0,
        monthlyExpenses: Number(finMonthlyExpenses) || 0,
        documents: docsArray,
      });

      const nextStage: PipelineStage = sendEmailToBank ? "BANK_SUBMITTED" : "FINANCE_APP";

      await upsertCrmContact({
        contactKey: selectedContact.contactKey,
        chatId: selectedContact.chatId,
        name: `${finFirstName} ${finLastName}`.trim() || selectedContact.name,
        phone: finPhone.trim() || selectedContact.phone,
        email: finEmail.trim(),
        idNumber: finIdNumber.trim(),
        address: finAddress.trim(),
        employerName: finEmployerName.trim(),
        jobTitle: finJobTitle.trim(),
        monthlyIncomeGross: Number(finMonthlyIncome) || 0,
        monthlyExpenses: Number(finMonthlyExpenses) || 0,
        stage: nextStage,
        assignedCarId: finCarId,
        assignedCarName: finCarName,
        dealValueZar: Number(finCarPrice) || 0,
        depositZar: Number(finDeposit) || 0,
        ficaDocsCount: docsArray.length,
        notes: finNotes,
        lastContactedLabel: "Just Updated",
        lastContactedAt: new Date().toISOString(),
        isRecentChat: true,
      });

      if (sendEmailToBank) {
        const loanPrincipal = Math.max(
          (Number(finCarPrice) || 0) - (Number(finDeposit) || 0),
          0
        );
        const monthlyRate = 0.1175 / 12;
        const term = Number(finTermMonths) || 72;
        const estInstalment = Math.round(
          (loanPrincipal * monthlyRate * Math.pow(1 + monthlyRate, term)) /
            (Math.pow(1 + monthlyRate, term) - 1)
        );

        const emailSubjectLine = `OFFICIAL VEHICLE FINANCE APPLICATION — ${finFirstName} ${finLastName} (ID: ${
          finIdNumber || "Pending"
        }) — ${finCarName}`;
        const emailBodyText = `OFFICIAL DEALERSHIP VEHICLE FINANCE APPLICATION DOSSIER
Submitted by: AutoFame Dealership (1 Rifle Range Rd, Baragwanath, Johannesburg South)
Channel: WhatsApp Agent (ANTMAN-ZPBZZ) & Dealership CRM
====================================================================

1. APPLICANT DETAILS
• Full Name: ${finFirstName} ${finLastName}
• SA ID Number: ${finIdNumber || "Pending"}
• Mobile / WhatsApp: ${finPhone}
• Email Address: ${finEmail || "Provided via WhatsApp"}
• Physical Address: ${finAddress}

2. VEHICLE & LOAN STRUCTURE
• Vehicle: ${finCarName}
• Retail Price: R${Number(finCarPrice).toLocaleString()} ZAR
• Deposit: R${Number(finDeposit).toLocaleString()} ZAR
• Principal Loan Amount: R${loanPrincipal.toLocaleString()} ZAR
• Term & Rate: ${term} Months @ 11.75% Linked (~R${estInstalment.toLocaleString()} ZAR/month)

3. EMPLOYMENT & AFFORDABILITY
• Employer / Business: ${finEmployerName || "Not Specified"}
• Occupation: ${finJobTitle || "Not Specified"}
• Gross Monthly Income: R${Number(finMonthlyIncome).toLocaleString()} ZAR
• Monthly Expenses: R${Number(finMonthlyExpenses).toLocaleString()} ZAR
• Net Disposable Income: R${Math.max(
          Number(finMonthlyIncome) - Number(finMonthlyExpenses),
          0
        ).toLocaleString()} ZAR

4. ATTACHED FICA PROOF DOCUMENTS (${docsArray.length}/5)
${
  docsArray.length > 0
    ? docsArray.map((d, i) => `${i + 1}. [${d.docType}] ${d.originalName} — ${d.url}`).join("\n")
    : "No proof documents attached yet."
}`;

        const emailRes = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            fromEmail: "alexsouthflow3@gmail.com",
            appPassword: "dmjjjsyxcpqpdwlb",
            to: bankRecipientEmail,
            subject: emailSubjectLine,
            body: emailBodyText,
            attachments: docsArray.map((d) => ({
              filename: d.originalName,
              url: d.url,
              mime: d.mime,
            })),
          }),
        });
        const emailData = await emailRes.json();
        if (!emailRes.ok) {
          throw new Error(emailData.error || "Bank email dispatch failed");
        }
        toast.success(
          `Dispatched Finance Application & ${docsArray.length} attachment(s) to ${bankRecipientEmail}`
        );
      } else {
        toast.success(`Saved Finance Dossier for ${finFirstName} ${finLastName}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process finance dossier");
    }
  };

  const recentChatsCount = useMemo(
    () => masterContacts.filter((c) => c.isRecentChat).length,
    [masterContacts]
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#11100e] text-[#eae7e1] font-sans select-none">
      <input
        ref={proofDocInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={handleUploadProofDocument}
      />

      {/* ────────────────────────────────────────────────────────── */}
      {/* SLEEK, UNCLUSTERED RESPONSIVE TOP BAR (NO OVERFLOW)        */}
      {/* ────────────────────────────────────────────────────────── */}
      <header className="h-12 shrink-0 border-b border-[#25231f] bg-[#161512] px-3 sm:px-5 flex items-center justify-between gap-2">
        {/* Left: Back to Agent + Clean Brand Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/admin/agent"
            className="h-8 px-2.5 rounded-lg bg-[#22201c] hover:bg-[#2c2924] border border-[#35312b] text-xs font-medium text-[#dedad2] flex items-center gap-1.5 transition shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Agent</span>
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Briefcase className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#f5f2eb] truncate">
              AutoFame CRM
            </span>
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {masterContacts.length} Contacts • {realCars.length} Cars
            </span>
          </div>
        </div>

        {/* Center: Clean Segmented View Switcher */}
        <div className="flex items-center gap-1 bg-[#11100e] p-1 rounded-xl border border-[#292621] shrink-0">
          <button
            type="button"
            onClick={() => setActiveView("inbox")}
            className={cn(
              "px-2.5 sm:px-3.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition",
              activeView === "inbox"
                ? "bg-emerald-600 text-white"
                : "text-[#8e8a82] hover:text-white"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Workspace</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("pipeline")}
            className={cn(
              "px-2.5 sm:px-3.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition",
              activeView === "pipeline"
                ? "bg-emerald-600 text-white"
                : "text-[#8e8a82] hover:text-white"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Pipeline</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("directory")}
            className={cn(
              "px-2.5 sm:px-3.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition",
              activeView === "directory"
                ? "bg-emerald-600 text-white"
                : "text-[#8e8a82] hover:text-white"
            )}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>Directory</span>
          </button>
        </div>

        {/* Right: Quick Sync + New Contact */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchWhatsAppDirectory}
            title="Sync WhatsApp Directory"
            className="h-8 px-2.5 rounded-lg bg-[#22201c] hover:bg-[#2c2924] border border-[#35312b] text-xs text-[#dedad2] flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden md:inline">Sync</span>
          </button>

          <Button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>+ Contact</span>
          </Button>
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────── */}
      {/* VIEW 1: ZERO-SCROLL WORKSPACE (CONTACTS + CHAT / DOSSIER)  */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeView === "inbox" && (
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT PANE: FITTED CONTACT SELECTOR (NO SCROLLBAR NEEDED) */}
          <aside className="w-72 lg:w-80 shrink-0 border-r border-[#25231f] bg-[#141310] flex flex-col justify-between overflow-hidden">
            {/* Search & Filter Header */}
            <div className="p-2.5 border-b border-[#25231f] space-y-2 shrink-0">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#8e8a82] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contact or phone..."
                  className="w-full bg-[#1b1a17] border border-[#33302a] rounded-lg pl-8 pr-7 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8e8a82] hover:text-white"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: "recent", label: `Recent (${recentChatsCount})` },
                  { id: "all", label: `All (${masterContacts.length})` },
                  { id: "finance", label: "Finance" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setContactFilter(tab.id as any)}
                    className={cn(
                      "py-1 px-1.5 rounded-md text-[10px] font-semibold border truncate transition",
                      contactFilter === tab.id
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-[#1a1916] border-[#262420] text-[#8e8a82] hover:text-white"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fitted Contact List (8 per page — Zero Scrollbar!) */}
            <div className="flex-1 flex flex-col divide-y divide-[#1f1d19] overflow-hidden">
              {pagedSidebarContacts.map((c, idx) => {
                const isSelected = selectedContact?.contactKey === c.contactKey;
                const stageMeta =
                  PIPELINE_STAGES.find((s) => s.id === c.stage) || PIPELINE_STAGES[1];
                const initials =
                  (c.name || "WA")
                    .replace(/[^A-Za-z0-9\s]/g, "")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w: string) => w[0] || "")
                    .join("")
                    .toUpperCase() || "WA";

                return (
                  <button
                    key={`${c.contactKey}-${idx}`}
                    type="button"
                    onClick={() => handleSelectContact(c)}
                    className={cn(
                      "w-full flex-1 text-left px-3 py-1.5 transition flex items-center gap-2.5 min-h-0",
                      isSelected
                        ? "bg-emerald-500/15 border-l-2 border-l-emerald-400"
                        : "hover:bg-[#1b1a17]"
                    )}
                  >
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-300 shrink-0">
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-[#f5f2eb] truncate">{c.name}</p>
                        <span className="text-[9px] font-mono text-emerald-400 shrink-0">
                          {c.lastContactedLabel || "Synced"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-[10px] text-[#8e8a82] truncate">
                          {c.lastMessage || c.phone}
                        </p>
                        <span
                          className={cn(
                            "text-[8px] font-semibold px-1.5 py-0.2 rounded border shrink-0",
                            stageMeta.badgeClass
                          )}
                        >
                          {stageMeta.shortLabel}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Compact Page Flipper Footer */}
            <div className="h-9 px-3 border-t border-[#25231f] bg-[#161512] flex items-center justify-between text-[10px] font-mono text-[#8e8a82] shrink-0">
              <button
                type="button"
                disabled={sidebarPage === 0}
                onClick={() => setSidebarPage((p) => Math.max(0, p - 1))}
                className="px-2 py-0.5 rounded bg-[#22201c] hover:bg-[#2c2924] disabled:opacity-40 text-white flex items-center gap-1"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <span>
                Page {sidebarPage + 1} / {totalSidebarPages}
              </span>
              <button
                type="button"
                disabled={sidebarPage + 1 >= totalSidebarPages}
                onClick={() =>
                  setSidebarPage((p) => Math.min(totalSidebarPages - 1, p + 1))
                }
                className="px-2 py-0.5 rounded bg-[#22201c] hover:bg-[#2c2924] disabled:opacity-40 text-white flex items-center gap-1"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </aside>

          {/* MAIN WORKSPACE: TABBED ZERO-SCROLL CUSTOMER COMMAND CENTER */}
          <main className="flex-1 flex flex-col bg-[#11100e] overflow-hidden">
            {selectedContact ? (
              <>
                {/* Customer Sub-Header Bar with Chat vs Dossier Toggle */}
                <div className="h-12 px-4 border-b border-[#25231f] bg-[#161512] flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-300 shrink-0">
                      {(selectedContact.name || "C")[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xs sm:text-sm font-bold text-[#f5f2eb] truncate">
                          {selectedContact.name}
                        </h2>
                        <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                          {selectedContact.phone}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Center: Mode Switcher (Conversation & Quotes vs Finance Dossier & Bank) */}
                  <div className="flex items-center gap-1 bg-[#11100e] p-1 rounded-lg border border-[#292621] shrink-0">
                    <button
                      type="button"
                      onClick={() => setWorkspaceTab("chat")}
                      className={cn(
                        "px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition",
                        workspaceTab === "chat"
                          ? "bg-emerald-600 text-white"
                          : "text-[#8e8a82] hover:text-white"
                      )}
                    >
                      <PhoneCall className="h-3 w-3" />
                      <span>Chat &amp; Quotes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceTab("dossier")}
                      className={cn(
                        "px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition",
                        workspaceTab === "dossier"
                          ? "bg-emerald-600 text-white"
                          : "text-[#8e8a82] hover:text-white"
                      )}
                    >
                      <Building2 className="h-3 w-3" />
                      <span>
                        Finance Dossier ({Object.keys(finProofDocs).length}/5 Docs)
                      </span>
                    </button>
                  </div>

                  {/* Right: Stage Selector */}
                  <div className="hidden md:flex items-center gap-2 shrink-0">
                    <select
                      value={selectedContact.stage || "CONTACTED"}
                      onChange={(e) =>
                        handleStageChange(selectedContact, e.target.value as PipelineStage)
                      }
                      className="bg-[#1b1a17] border border-[#35312b] rounded-lg px-2.5 py-1 text-xs font-semibold text-[#f5f2eb] focus:outline-none focus:border-emerald-500"
                    >
                      {PIPELINE_STAGES.map((st) => (
                        <option key={st.id} value={st.id}>
                          Stage: {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SUB-TAB 1: CONVERSATION & QUOTATION COMPOSER (FITTED ZERO-SCROLL) */}
                {workspaceTab === "chat" && (
                  <div className="flex-1 flex flex-col justify-between p-4 gap-3 overflow-hidden">
                    {/* Top: Active Deal Summary + Recent Messages */}
                    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
                      {/* Vehicle & Deal Value Bar */}
                      <div className="p-3 rounded-xl bg-[#161512] border border-[#262420] flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <Car className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="text-xs text-[#8e8a82]">Assigned Vehicle:</span>
                          <select
                            value={finCarId || ""}
                            onChange={(e) => {
                              const id = Number(e.target.value);
                              const car = realCars.find((c: any) => c.id === id);
                              if (car) {
                                setFinCarId(car.id);
                                setFinCarName(`${car.year} ${car.make} ${car.model}`);
                                setFinCarPrice(car.price || 0);
                                setFinDeposit(Math.round((car.price || 0) * 0.1));
                              }
                            }}
                            className="bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
                          >
                            {realCars.map((c: any) => (
                              <option key={c.id} value={c.id}>
                                {c.year} {c.make} {c.model} — R
                                {Number(c.price || 0).toLocaleString()} ZAR
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <span>
                            Price:{" "}
                            <strong className="font-mono text-emerald-400">
                              R{Number(finCarPrice || 0).toLocaleString()}
                            </strong>
                          </span>
                          <span>
                            10% Deposit:{" "}
                            <strong className="font-mono text-[#f5f2eb]">
                              R{Number(finDeposit || 0).toLocaleString()}
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setWorkspaceTab("dossier")}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300"
                          >
                            Open Finance Dossier →
                          </button>
                        </div>
                      </div>

                      {/* Messages Display Area */}
                      <div className="flex-1 rounded-xl bg-[#151411] border border-[#24221e] p-4 flex flex-col justify-between gap-3 overflow-hidden">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[#22201c] border border-[#35312b] flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                            {(selectedContact.name || "C")[0]?.toUpperCase()}
                          </div>
                          <div className="max-w-2xl rounded-xl bg-[#1c1a17] border border-[#2e2b25] p-3 space-y-1">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-xs font-bold text-emerald-400">
                                {selectedContact.name} ({selectedContact.phone})
                              </span>
                              <span className="text-[10px] font-mono text-[#8e8a82]">
                                {selectedContact.lastContactedLabel || "WhatsApp Chat"}
                              </span>
                            </div>
                            <p className="text-xs text-[#eae7e1] line-clamp-3 leading-relaxed">
                              {selectedContact.lastMessage || "No message text recorded."}
                            </p>
                          </div>
                        </div>

                        {(contactChatHistory[selectedContact.contactKey] || []).map((m) => (
                          <div key={m.id} className="flex justify-end">
                            <div className="max-w-2xl rounded-xl bg-emerald-600/20 border border-emerald-500/40 p-3 space-y-1 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-[10px] font-mono text-emerald-300">
                                  {m.sender} • {m.time}
                                </span>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              </div>
                              <p className="text-xs text-[#f5f2eb] line-clamp-3 text-left leading-relaxed">
                                {m.text}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom: Omnichannel Reply & Quotation Composer */}
                    <div className="p-3.5 rounded-xl bg-[#161512] border border-[#262420] space-y-2.5 shrink-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setComposerChannel("whatsapp")}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition",
                              composerChannel === "whatsapp"
                                ? "bg-emerald-600 text-white border-emerald-500"
                                : "bg-[#1b1a17] text-[#8e8a82] border-[#2e2b25]"
                            )}
                          >
                            <PhoneCall className="h-3 w-3" />
                            <span>WhatsApp Reply</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setComposerChannel("email")}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition",
                              composerChannel === "email"
                                ? "bg-emerald-600 text-white border-emerald-500"
                                : "bg-[#1b1a17] text-[#8e8a82] border-[#2e2b25]"
                            )}
                          >
                            <Mail className="h-3 w-3" />
                            <span>Gmail Dispatch</span>
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const firstName = selectedContact.name
                                .replace(/\(.*?\)/g, "")
                                .trim()
                                .split(" ")[0];
                              setComposerText(
                                `Hi ${firstName}, thank you for contacting AutoFame Dealership Johannesburg South. I have reviewed your message regarding the ${finCarName}. How can I assist you further today?`
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#22201c] hover:bg-[#2c2924] border border-[#35312b] text-[11px] font-medium text-[#eae7e1]"
                          >
                            Smart Reply
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const firstName = selectedContact.name
                                .replace(/\(.*?\)/g, "")
                                .trim()
                                .split(" ")[0];
                              const price = Number(finCarPrice || 249900);
                              const deposit = Number(finDeposit || Math.round(price * 0.1));
                              const loan = Math.max(price - deposit, 0);
                              const est = Math.round(loan * 0.0218);
                              setComposerText(
                                `📄 *AUTOFAME OFFICIAL VEHICLE QUOTATION*\n━━━━━━━━━━━━━━━━━━━━\nHi ${firstName}, here is your official quotation:\n\n🚘 *Vehicle:* ${finCarName}\n💰 *Retail Price:* R${price.toLocaleString()} ZAR\n💵 *10% Deposit:* R${deposit.toLocaleString()} ZAR\n💳 *Principal Loan:* R${loan.toLocaleString()} ZAR\n📊 *Est. Monthly:* ~R${est.toLocaleString()} ZAR/pm (72 Months @ 11.75%)\n\nReply *FINANCE* or send your SA ID, Driver's License, 3 months bank statements & payslips here to apply.`
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#22201c] hover:bg-[#2c2924] border border-[#35312b] text-[11px] font-medium text-[#eae7e1]"
                          >
                            Official Quote
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const firstName = selectedContact.name
                                .replace(/\(.*?\)/g, "")
                                .trim()
                                .split(" ")[0];
                              setComposerText(
                                `📋 *AutoFame Vehicle Finance Application Container*\n\nHi ${firstName}, to submit your bank finance application for the *${finCarName}* (R${Number(
                                  finCarPrice || 0
                                ).toLocaleString()} ZAR), please reply here with:\n1. Full Name, 13-Digit SA ID, Email & Address\n2. Employer, Job Title, Gross Monthly Income & Expenses\n3. FICA Proof Docs: SA ID, Driver's License, 3 Months Bank Statements, Payslips & Proof of Residence.`
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#22201c] hover:bg-[#2c2924] border border-[#35312b] text-[11px] font-medium text-[#eae7e1]"
                          >
                            Finance Container
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <textarea
                          rows={3}
                          value={composerText}
                          onChange={(e) => setComposerText(e.target.value)}
                          placeholder="Write a WhatsApp message, vehicle quotation, or finance checklist..."
                          className="flex-1 bg-[#1b1a17] border border-[#33302a] rounded-xl p-2.5 text-xs text-[#f5f2eb] leading-relaxed focus:outline-none focus:border-emerald-500 resize-none"
                        />
                        <Button
                          type="button"
                          disabled={sendingMessage}
                          onClick={handleSendOmnichannelMessage}
                          className="h-auto px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex flex-col items-center justify-center gap-1 shrink-0"
                        >
                          <Send className="h-4 w-4" />
                          <span>
                            {sendingMessage
                              ? "Sending..."
                              : composerChannel === "whatsapp"
                              ? "Send WhatsApp"
                              : "Send Email"}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-TAB 2: 2-COLUMN ZERO-SCROLL FINANCE DOSSIER & BANK SUBMISSION */}
                {workspaceTab === "dossier" && (
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden">
                    {/* Left Column: Applicant, Vehicle & Affordability Fields */}
                    <div className="flex flex-col justify-between rounded-xl bg-[#161512] border border-[#262420] p-4 overflow-hidden">
                      <div className="flex items-center justify-between pb-2 border-b border-[#25231f]">
                        <div>
                          <h3 className="text-xs font-bold uppercase font-mono text-emerald-400">
                            1. Applicant, Vehicle &amp; Affordability
                          </h3>
                          <p className="text-[10px] text-[#8e8a82]">
                            Auto-filled from WhatsApp chat or editable below
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleExtractFromWhatsAppToDossier}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-[10px] font-semibold text-emerald-300 flex items-center gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Extract Chat → Form
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            First Name
                          </label>
                          <input
                            type="text"
                            value={finFirstName}
                            onChange={(e) => setFinFirstName(e.target.value)}
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Surname
                          </label>
                          <input
                            type="text"
                            value={finLastName}
                            onChange={(e) => setFinLastName(e.target.value)}
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            13-Digit SA ID
                          </label>
                          <input
                            type="text"
                            value={finIdNumber}
                            onChange={(e) => setFinIdNumber(e.target.value)}
                            placeholder="9001015009087"
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            WhatsApp / Phone
                          </label>
                          <input
                            type="text"
                            value={finPhone}
                            onChange={(e) => setFinPhone(e.target.value)}
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={finEmail}
                            onChange={(e) => setFinEmail(e.target.value)}
                            placeholder="client@email.co.za"
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Physical Address
                          </label>
                          <input
                            type="text"
                            value={finAddress}
                            onChange={(e) => setFinAddress(e.target.value)}
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#25231f]">
                        <div className="col-span-2">
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Showroom Vehicle
                          </label>
                          <select
                            value={finCarId || ""}
                            onChange={(e) => {
                              const id = Number(e.target.value);
                              const car = realCars.find((c: any) => c.id === id);
                              if (car) {
                                setFinCarId(car.id);
                                setFinCarName(`${car.year} ${car.make} ${car.model}`);
                                setFinCarPrice(car.price || 0);
                                setFinDeposit(Math.round((car.price || 0) * 0.1));
                              }
                            }}
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            {realCars.map((c: any) => (
                              <option key={c.id} value={c.id}>
                                {c.year} {c.make} {c.model} — R
                                {Number(c.price || 0).toLocaleString()}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Deposit (R ZAR)
                          </label>
                          <input
                            type="number"
                            value={finDeposit || ""}
                            onChange={(e) => setFinDeposit(Number(e.target.value))}
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#25231f]">
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Employer / Bank
                          </label>
                          <input
                            type="text"
                            value={finEmployerName}
                            onChange={(e) => setFinEmployerName(e.target.value)}
                            placeholder="Company Name"
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Gross Income (R)
                          </label>
                          <input
                            type="number"
                            value={finMonthlyIncome || ""}
                            onChange={(e) => setFinMonthlyIncome(Number(e.target.value))}
                            placeholder="38000"
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8e8a82] block mb-0.5">
                            Expenses (R)
                          </label>
                          <input
                            type="number"
                            value={finMonthlyExpenses || ""}
                            onChange={(e) => setFinMonthlyExpenses(Number(e.target.value))}
                            placeholder="14500"
                            className="w-full bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right Column: 5 FICA Proof Documents & Bank Email Dispatch */}
                    <div className="flex flex-col justify-between rounded-xl bg-[#161512] border border-[#262420] p-4 overflow-hidden">
                      <div className="flex items-center justify-between pb-2 border-b border-[#25231f]">
                        <div>
                          <h3 className="text-xs font-bold uppercase font-mono text-emerald-400">
                            2. FICA Proof Documents &amp; Bank Dispatch
                          </h3>
                          <p className="text-[10px] text-[#8e8a82]">
                            Attach all 5 documents and dispatch with MIME attachments
                          </p>
                        </div>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold",
                            missingFinanceItems.length === 0
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          )}
                        >
                          {Object.keys(finProofDocs).length}/5 Uploaded
                        </span>
                      </div>

                      {/* 5 Compact Document Rows */}
                      <div className="space-y-1.5">
                        {FICA_DOCUMENT_TYPES.map((doc) => {
                          const uploaded = finProofDocs[doc.code];
                          return (
                            <div
                              key={doc.code}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-lg border text-xs",
                                uploaded
                                  ? "bg-emerald-500/10 border-emerald-500/40"
                                  : "bg-[#11100e] border-[#262420]"
                              )}
                            >
                              <div className="min-w-0 flex-1 pr-2 flex items-center gap-2">
                                {uploaded ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5 text-[#8e8a82] shrink-0" />
                                )}
                                <span className="text-xs font-medium text-[#eae7e1] truncate">
                                  {doc.label}
                                </span>
                                {uploaded && (
                                  <span className="text-[10px] text-emerald-400 truncate">
                                    ({uploaded.originalName})
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDocUploadCode(doc.code);
                                  proofDocInputRef.current?.click();
                                }}
                                className="px-2.5 py-1 rounded bg-[#22201c] hover:bg-[#2c2924] border border-[#35312b] text-[10px] font-semibold text-[#dedad2] shrink-0 flex items-center gap-1"
                              >
                                <Upload className="h-3 w-3 text-emerald-400" />
                                {uploaded ? "Replace" : "Attach"}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Bank Underwriting Selector & Submit Buttons */}
                      <div className="pt-2 border-t border-[#25231f] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] font-mono uppercase text-[#8e8a82]">
                            Target Bank Desk:
                          </label>
                          <select
                            value={bankRecipientEmail}
                            onChange={(e) => setBankRecipientEmail(e.target.value)}
                            className="flex-1 bg-[#11100e] border border-[#33302a] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            {BANK_OPTIONS.map((b) => (
                              <option key={b.email} value={b.email}>
                                {b.label} ({b.email})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            onClick={() => handleSaveDossierAndSubmitToBank(false)}
                            className="bg-[#22201c] hover:bg-[#2c2924] text-white border border-[#35312b] text-xs font-semibold h-9 rounded-xl"
                          >
                            Save Dossier
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleSaveDossierAndSubmitToBank(true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-9 rounded-xl flex items-center justify-center gap-1.5"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Email Dossier &amp; Docs to Bank
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </main>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* VIEW 2: FULL-WIDTH RESPONSIVE PIPELINE GRID (ZERO SCROLL)  */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeView === "pipeline" && (
        <PipelineBoard
          contacts={masterContacts}
          stages={PIPELINE_STAGES}
          onMove={handlePipelineMove}
          onPriorityChange={handlePriorityChange}
          onOpen={(c) => {
            handleSelectContact(c);
            setActiveView("inbox");
          }}
        />
      )}


      {/* ────────────────────────────────────────────────────────── */}
      {/* VIEW 3: ZERO-SCROLL PAGINATED MASTER CONTACT DIRECTORY     */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeView === "directory" && (
        <div className="flex-1 flex flex-col p-4 bg-[#11100e] overflow-hidden">
          <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col justify-between bg-[#161512] border border-[#25231f] rounded-2xl overflow-hidden">
            {/* Toolbar */}
            <div className="p-3.5 border-b border-[#25231f] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-[#f5f2eb]">
                  Master Dealership Contact Directory ({filteredContacts.length} Contacts)
                </h2>
                <p className="text-[10px] text-[#8e8a82]">
                  Sorted by Last Contacted • Zero-scroll paginated directory
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by name, phone, car, or message..."
                  className="w-64 bg-[#11100e] border border-[#33302a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Fitted Table Body (9 rows per page — Zero Scrollbar!) */}
            <div className="flex-1 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#1c1a17] border-b border-[#2e2b25] text-[10px] font-mono uppercase text-[#8e8a82]">
                  <tr>
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-4">Contact Name</th>
                    <th className="py-2.5 px-4">WhatsApp / Phone</th>
                    <th className="py-2.5 px-4">Stage</th>
                    <th className="py-2.5 px-4">Assigned Vehicle</th>
                    <th className="py-2.5 px-4">Deal Value</th>
                    <th className="py-2.5 px-4">Last Message</th>
                    <th className="py-2.5 px-4">Last Contacted</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#22201c] text-xs">
                  {pagedDirectoryContacts.map((c, i) => {
                    const rowNum = directoryPage * DIRECTORY_PAGE_SIZE + i + 1;
                    const stageMeta =
                      PIPELINE_STAGES.find((s) => s.id === c.stage) || PIPELINE_STAGES[1];
                    return (
                      <tr
                        key={`${c.contactKey}-${rowNum}`}
                        className="hover:bg-[#1c1a17] transition"
                      >
                        <td className="py-2.5 px-4 font-mono text-[11px] text-[#8e8a82]">
                          {rowNum}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-[#f5f2eb]">{c.name}</td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400">
                          {c.phone}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded border",
                              stageMeta.badgeClass
                            )}
                          >
                            {stageMeta.shortLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-[#dedad2] truncate max-w-[180px]">
                          {c.assignedCarName}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-emerald-300">
                          R{Number(c.dealValueZar || 249900).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-[#a09c94] max-w-xs truncate">
                          {c.lastMessage}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-emerald-400">
                          {c.lastContactedLabel || "Synced"}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectContact(c);
                                setWorkspaceTab("chat");
                                setActiveView("inbox");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold"
                            >
                              Chat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectContact(c);
                                setWorkspaceTab("dossier");
                                setActiveView("inbox");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#22201c] hover:bg-[#2c2924] border border-[#35312b] text-[#dedad2] text-[11px] font-semibold"
                            >
                              Dossier
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="h-10 px-4 border-t border-[#25231f] bg-[#141310] flex items-center justify-between text-xs font-mono text-[#8e8a82] shrink-0">
              <span>
                Showing {directoryPage * DIRECTORY_PAGE_SIZE + 1}–
                {Math.min(
                  (directoryPage + 1) * DIRECTORY_PAGE_SIZE,
                  filteredContacts.length
                )}{" "}
                of {filteredContacts.length} Contacts
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={directoryPage === 0}
                  onClick={() => setDirectoryPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1 rounded-lg bg-[#22201c] hover:bg-[#2c2924] disabled:opacity-40 text-white flex items-center gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <span className="text-white">
                  Page {directoryPage + 1} of {totalDirectoryPages}
                </span>
                <button
                  type="button"
                  disabled={directoryPage + 1 >= totalDirectoryPages}
                  onClick={() =>
                    setDirectoryPage((p) => Math.min(totalDirectoryPages - 1, p + 1))
                  }
                  className="px-3 py-1 rounded-lg bg-[#22201c] hover:bg-[#2c2924] disabled:opacity-40 text-white flex items-center gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* ADD NEW CONTACT MODAL                                      */}
      {/* ────────────────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full rounded-2xl bg-[#181714] border border-[#35312b] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#292621]">
              <div>
                <h3 className="text-sm font-bold text-[#f5f2eb]">
                  Add Contact to AutoFame CRM
                </h3>
                <p className="text-[11px] text-[#8e8a82]">
                  Saves permanently to Convex CRM &amp; WhatsApp Directory
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[#8e8a82] hover:text-white p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-mono uppercase text-[#8e8a82] block mb-1">
                  Contact Full Name *
                </label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Sipho Ndlovu"
                  className="w-full bg-[#11100e] border border-[#33302a] rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-[#8e8a82] block mb-1">
                  WhatsApp / Mobile Phone Number *
                </label>
                <input
                  type="text"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="e.g. +27 82 555 1234 or 082 555 1234"
                  className="w-full bg-[#11100e] border border-[#33302a] rounded-xl px-3 py-2 font-mono text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono uppercase text-[#8e8a82] block mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="client@email.co.za"
                    className="w-full bg-[#11100e] border border-[#33302a] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-[#8e8a82] block mb-1">
                    Pipeline Stage
                  </label>
                  <select
                    value={addStage}
                    onChange={(e) => setAddStage(e.target.value as PipelineStage)}
                    className="w-full bg-[#11100e] border border-[#33302a] rounded-xl px-3 py-2 text-white"
                  >
                    {PIPELINE_STAGES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-[#8e8a82] block mb-1">
                  Interested Showroom Vehicle
                </label>
                <select
                  value={addCarId || ""}
                  onChange={(e) => setAddCarId(Number(e.target.value))}
                  className="w-full bg-[#11100e] border border-[#33302a] rounded-xl px-3 py-2 text-white"
                >
                  {realCars.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.year} {c.make} {c.model} — R{Number(c.price || 0).toLocaleString()} ZAR
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#292621]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAddModal(false)}
                className="text-xs text-[#8e8a82] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateContact}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl px-4"
              >
                + Save &amp; Open in CRM
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
