export interface SamplePhoto {
  file: string;
  credit?: string;
  sourceUrl?: string;
  license?: string;
}
export interface SampleStore {
  slug: string;
  name: string;
  tagline: string;
  storeType: string;
  photos: SamplePhoto[];
  video?: SamplePhoto;
}

/** Seedance-generated walkthrough clips (checked into /public/samples/videos). */
export const SAMPLE_VIDEOS: { slug: string; name: string; tagline: string; storeType: string; file: string; poster: string }[] = [
  {
    slug: "home-gift-video",
    name: "Hearth & Hollow",
    tagline: "Home, kitchen & gift boutique",
    storeType: "Home Decor Store",
    file: "/samples/videos/home-gift-walkthrough.mp4",
    poster: "/samples/videos/home-gift-walkthrough.jpg",
  },
  {
    slug: "boutique-video",
    name: "Juniper & June",
    tagline: "Women's apparel & accessories boutique",
    storeType: "Apparel Boutique",
    file: "/samples/videos/boutique-walkthrough.mp4",
    poster: "/samples/videos/boutique-walkthrough.jpg",
  },
  {
    slug: "general-store-video",
    name: "Fern & Fig General",
    tagline: "Neighborhood general store & pantry",
    storeType: "General Store",
    file: "/samples/videos/general-store-walkthrough.mp4",
    poster: "/samples/videos/general-store-walkthrough.jpg",
  },
];

export async function loadSampleManifest(): Promise<SampleStore[]> {
  try {
    const res = await fetch("/samples/manifest.json", { cache: "force-cache" });
    if (!res.ok) return [];
    return (await res.json()) as SampleStore[];
  } catch {
    return [];
  }
}

export function samplePhotoUrl(store: SampleStore, photo: SamplePhoto): string {
  return photo.file.startsWith("/") ? photo.file : `/samples/${store.slug}/${photo.file}`;
}
