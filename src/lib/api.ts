import MeetingListItem from "@/components/MeetingListItem";
import { Meeting, MeetingStats, FilterOptions } from "@/types/meeting";

const PB_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  "http://172.30.0.200:8091";

export async function getMeetings(
  filters?: FilterOptions
): Promise<Meeting[]> {
  const params = new URLSearchParams();

  params.set("perPage", "500");

  if (filters?.type && filters.type !== "All") {
    params.set(
      "filter",
      `officer_type="${filters.type}"`
    );
  }

  if (filters?.sortBy) {
    const sortField =
      filters.sortBy === "name"
        ? "officer_name"
        : filters.sortBy === "type"
        ? "officer_type"
        : "meeting_date";

    const order =
      filters.sortOrder === "asc" ? "+" : "-";

    params.set("sort", `${order}${sortField}`);
  } else {
    params.set("sort", "-meeting_date");
  }

  const url = `${PB_URL}/api/collections/meetings/records?${params.toString()}`;

  console.log("Fetching meetings from:", url);

  const res = await fetch(url, {
    cache: "no-store",
  });

//   const responseData = await res.json();

// console.log("Meetings data received:", responseData);

// //   const dataa = await pb.collection("meetings").getList(1, 500);

// // console.log("Meetings received:", data);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch meetings: ${res.status}`
    );
  }

  const data = await res.json();

  console.log("Meetings received:", data);

  return data.items || [];
}

export async function getMeetingStats(): Promise<MeetingStats> {
  const meetings = await getMeetings();

  const today = new Date().toDateString();

  return {
    totalMeetings: meetings.length,

    iasCount: meetings.filter(
      (m) => m.officer_type === "IAS"
    ).length,

    ipsCount: meetings.filter(
      (m) => m.officer_type === "IPS"
    ).length,

    otherCount: meetings.filter(
      (m) => m.officer_type === "Other"
    ).length,

    todayMeetings: meetings.filter((m) => {
      const meetingDate = new Date(
        m.meeting_date
      ).toDateString();

      return meetingDate === today;
    }).length,

    upcomingMeetings: meetings.filter(
      (m) => new Date(m.meeting_date) > new Date()
    ).length,
  };
}