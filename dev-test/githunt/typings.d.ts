
export type FeedType = "HOT" | "NEW" | "TOP";

export interface Entry {
  repository: Repository;
  postedBy: User;
  createdAt: number;
  score: number;
  hotScore: number;
  comments: Array<Comment>;
  commentCount: number;
  id: number;
  vote: Vote;
}

export interface Repository {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  open_issues_count: number | null;
  owner: User | null;
}

export interface User {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface Comment {
  id: number;
  postedBy: User;
  createdAt: number;
  content: string;
  repoName: string;
}

export interface Vote {
  vote_value: number;
}

export type VoteType = "UP" | "DOWN" | "CANCEL";

export namespace OnCommentAddedSubscription {
  export type Variables = {
      repoFullName: string;
  }

  export type Result = {
    commentAdded: CommentAdded;
  } 

  export type CommentAdded = {
    id: number;
    postedBy: PostedBy;
    createdAt: number;
    content: string;
  } 

  export type PostedBy = {
    login: string;
    html_url: string;
  } 
}

export namespace CommentQuery {
  export type Variables = {
      repoFullName: string;
      limit: number | null;
      offset: number | null;
  }

  export type Result = {
    currentUser: CurrentUser;
    entry: Entry;
  } 

  export type CurrentUser = {
    login: string;
    html_url: string;
  } 

  export type Entry = {
    id: number;
    postedBy: PostedBy;
    createdAt: number;
    comments: Array<Comments>;
    commentCount: number;
    repository: Repository;
  } 

  export type PostedBy = {
    login: string;
    html_url: string;
  } 

  export type Comments = {
  } & CommentsPageComment.Fragment 

  export type Repository = {
    full_name: string;
    html_url: string;
  } & (RepositoryInlineFragment | {}) 

  export type RepositoryInlineFragment = {
    __typename = "Repository";
    description: string;
    open_issues_count: number;
    stargazers_count: number;
  } 
}

export namespace CommentsPageComment {
  export type Variables = {
  }

  export type Fragment = {
    id: number;
    postedBy: PostedBy;
    createdAt: number;
    content: string;
  } 

  export type PostedBy = {
    login: string;
    html_url: string;
  } 
}

export namespace CurrentUserForProfileQuery {
  export type Variables = {
  }

  export type Result = {
    currentUser: CurrentUser;
  } 

  export type CurrentUser = {
    login: string;
    avatar_url: string;
  } 
}

export namespace FeedEntry {
  export type Variables = {
  }

  export type Fragment = {
    id: number;
    commentCount: number;
    repository: Repository;
  } & VoteButtons.Fragment & RepoInfo.Fragment 

  export type Repository = {
    full_name: string;
    html_url: string;
    owner: Owner;
  } 

  export type Owner = {
    avatar_url: string;
  } 
}

export namespace FeedQuery {
  export type Variables = {
      type: FeedType;
      offset: number | null;
      limit: number | null;
  }

  export type Result = {
    currentUser: CurrentUser;
    feed: Array<Feed>;
  } 

  export type CurrentUser = {
    login: string;
  } 

  export type Feed = {
  } & FeedEntry.Fragment 
}

export namespace SubmitRepositoryMutation {
  export type Variables = {
      repoFullName: string;
  }

  export type Result = {
    submitRepository: SubmitRepository;
  } 

  export type SubmitRepository = {
    createdAt: number;
  } 
}

export namespace RepoInfo {
  export type Variables = {
  }

  export type Fragment = {
    createdAt: number;
    repository: Repository;
    postedBy: PostedBy;
  } 

  export type Repository = {
    description: string;
    stargazers_count: number;
    open_issues_count: number;
  } 

  export type PostedBy = {
    html_url: string;
    login: string;
  } 
}

export namespace SubmitCommentMutation {
  export type Variables = {
      repoFullName: string;
      commentContent: string;
  }

  export type Result = {
    submitComment: SubmitComment;
  } 

  export type SubmitComment = {
  } & CommentsPageComment.Fragment 
}

export namespace VoteButtons {
  export type Variables = {
  }

  export type Fragment = {
    score: number;
    vote: Vote;
  } 

  export type Vote = {
    vote_value: number;
  } 
}

export namespace VoteMutation {
  export type Variables = {
      repoFullName: string;
      type: VoteType;
  }

  export type Result = {
    vote: Vote;
  } 

  export type Vote = {
    score: number;
    id: number;
    vote: _Vote;
  } 

  export type _Vote = {
    vote_value: number;
  } 
}
