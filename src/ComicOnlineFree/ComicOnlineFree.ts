import {
    Source,
    SourceManga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    ContentRating,
    BadgeColor,
    Request,
    Response,
    TagSection
} from '@paperback/types'

import {
    parseChapterDetails,
    isLastPage,
    parseChapters,
    parseHomeSections,
    parseMangaDetails,
    parseViewMore,
    parseSearch,
    parseTags
} from './ComicOnlineFreeParser'

import { URLBuilder } from './ComicOnlineFreeHelper'

const COF_DOMAIN = 'https://comiconlinefree.net'

export const ComicOnlineFreeInfo: SourceInfo = {
    version: '1.1.0',
    name: 'ComicOnlineFree',
    icon: 'icon.png',
    author: 'Netsky',
    authorWebsite: 'https://github.com/TheNetsky',
    description: 'Extension that pulls comics from ComicOnlineFree.net',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: COF_DOMAIN,
    sourceTags: [
        {
            text: 'Notifications',
            type: BadgeColor.GREEN
        }
    ]
}

export class ComicOnlineFree extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    ...{
                        'referer': `${COF_DOMAIN}/`,
                        'user-agent': await this.requestManager.getDefaultUserAgent()
                    }
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    });

    override getMangaShareUrl(mangaId: string): string { return `${COF_DOMAIN}/comic/${mangaId}` }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${COF_DOMAIN}/comic/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = this.cheerio.load(response.data)
        return parseMangaDetails($, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: `${COF_DOMAIN}/comic/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = this.cheerio.load(response.data)
        return parseChapters($)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${COF_DOMAIN}/${mangaId}/${chapterId}/full`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = this.cheerio.load(response.data)
        return parseChapterDetails($, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const request = App.createRequest({
            url: COF_DOMAIN,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = this.cheerio.load(response.data)
        parseHomeSections($, sectionCallback)
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        if (metadata?.completed) return metadata

        const page: number = metadata?.page ?? 1
        let param = ''

        switch (homepageSectionId) {
            case 'popular':
                param = `/popular-comic/${page}`
                break
            case 'hot':
                param = `/hot-comic/${page}`
                break
            default:
                throw new Error('Requested to getViewMoreItems for a section ID which doesn\'t exist')
        }

        const request = App.createRequest({
            url: COF_DOMAIN,
            method: 'GET',
            param
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = this.cheerio.load(response.data)
        const manga = parseViewMore($)

        metadata = !isLastPage($) ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = App.createRequest({
            url: `${COF_DOMAIN}/advanced-search`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)
        return parseTags($)
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const url = new URLBuilder(COF_DOMAIN)
            .addPathComponent('advanced-search')
            .addQueryParameter('key', encodeURI(query?.title || ''))
            .addQueryParameter('page', page)
            .addQueryParameter('wg', query.includedTags?.map((x: any) => x.id).join('%2C'))
            .buildUrl()

        const request = App.createRequest({
            url: url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)
        const manga = parseSearch($)
        metadata = !isLastPage($) ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    CloudFlareError(status: number): void {
        if (status == 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${ComicOnlineFree.name}> and press the cloud icon.`)
        }
    }


    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: COF_DOMAIN,
            method: 'GET',
            headers: {
                'referer': `${COF_DOMAIN}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }
}